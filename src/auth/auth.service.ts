import {
  BadRequestException,
  CACHE_MANAGER,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cache } from 'cache-manager';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as CryptoJS from 'crypto-js';

import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import {
  refreshTokenExpirationInCache,
  refreshTokenExpirationInCacheShortVersion,
  verifyEmailExpiration,
} from './auth.module';
import {
  LoginBodyDto,
  LoginOutput,
  LogoutBodyDto,
  LogoutOutput,
} from './dtos/login.dto';
import { sendPasswordResetEmailOutput } from './dtos/send-password-reset-email.dto';
import { RefreshTokenDto, RefreshTokenOutput } from './dtos/token.dto';
import { ValidateUserDto, ValidateUserOutput } from './dtos/validate-user.dto';
import { ONEYEAR, Payload } from './jwt/jwt.payload';
import { KakaoAuthorizeOutput, LoginWithKakaoDto } from './dtos/kakao.dto';
import { googleUserInfo } from './dtos/google.dto';
import { customJwtService } from './jwt/jwt.service';
import { UserRepository } from '../users/repository/user.repository';
import { CategoryRepository } from '../contents/repository/category.repository';
import { OAuthUtil } from './util/oauth.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: customJwtService,
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async jwtLogin({
    email,
    password,
    auto_login,
  }: LoginBodyDto): Promise<LoginOutput> {
    try {
      const { user } = await this.validateUser({ email, password });
      const payload: Payload = this.jwtService.createPayload(
        email,
        auto_login,
        user.id,
      );
      const refreshToken = await this.jwtService.generateRefreshToken(payload);
      await this.cacheManager.set(refreshToken, user.id, {
        ttl: auto_login
          ? refreshTokenExpirationInCache
          : refreshTokenExpirationInCacheShortVersion,
      });

      return {
        access_token: this.jwtService.sign(payload),
        refresh_token: refreshToken,
      };
    } catch (e) {
      throw e;
    }
  }

  async logout(
    userId: number,
    { refresh_token: refreshToken }: LogoutBodyDto,
  ): Promise<LogoutOutput> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (user) {
      if (!refreshToken) {
        throw new BadRequestException('Refresh token is required');
      }

      const refreshTokenInCache: number | undefined =
        await this.cacheManager.get(refreshToken);

      if (refreshTokenInCache === undefined) {
        throw new NotFoundException('Refresh token not found');
      }

      if (refreshTokenInCache !== userId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await this.cacheManager.del(refreshToken);

      return {};
    } else {
      throw new NotFoundException('User not found');
    }
  }

  async reissueToken({
    refresh_token: refreshToken,
  }: RefreshTokenDto): Promise<RefreshTokenOutput> {
    let decoded: Payload;
    try {
      // decoding refresh token
      decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_TOKEN_PRIVATE_KEY,
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const refreshTokenInCache = await this.cacheManager.get(refreshToken);

    if (!refreshTokenInCache) {
      throw new NotFoundException('There is no refresh token');
    }

    const user = await this.userRepository.findOneBy({ id: decoded.sub });
    const auto_login: boolean = decoded.period === ONEYEAR;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payload: Payload = this.jwtService.createPayload(
      user.email,
      auto_login,
      user.id,
    );
    const accessToken = this.jwtService.sign(payload);
    const newRefreshToken = await this.jwtService.generateRefreshToken(payload);

    await this.cacheManager.del(refreshToken);
    await this.cacheManager.set(newRefreshToken, user.id, {
      ttl: auto_login
        ? refreshTokenExpirationInCache
        : refreshTokenExpirationInCacheShortVersion,
    });

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
    };
  }

  async sendPasswordResetEmail(
    email: string,
  ): Promise<sendPasswordResetEmailOutput> {
    const user = await this.userRepository.findOneBy({ email });
    if (user) {
      if (!user.verified) {
        throw new UnauthorizedException('User not verified');
      }
      // Email Verification
      const code: string = uuidv4();
      await this.cacheManager.set(code, user.id, {
        ttl: verifyEmailExpiration,
      });

      // send password reset email to user using mailgun
      this.mailService.sendResetPasswordEmail(user.email, user.name, code);

      return {};
    } else {
      throw new NotFoundException('User not found');
    }
  }

  async validateUser({
    email,
    password,
  }: ValidateUserDto): Promise<ValidateUserOutput> {
    try {
      const user = await this.userRepository.findOne({
        where: { email },
        select: { id: true, password: true },
      });
      if (!user) {
        throw new NotFoundException('User Not Found');
      }

      const isPasswordCorrect = await user.checkPassword(password);

      if (isPasswordCorrect) {
        return { user };
      } else {
        throw new BadRequestException('Wrong Password');
      }
    } catch (e) {
      throw e;
    }
  }
}

@Injectable()
export class OauthService {
  constructor(
    private readonly jwtService: customJwtService,
    private readonly userRepository: UserRepository,
    private readonly categoryRepository: CategoryRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly oauthUtil: OAuthUtil,
  ) {}

  // OAuth Login
  async oauthLogin(email: string): Promise<LoginOutput> {
    try {
      const user: User = await this.userRepository.findOneByOrFail({ email });
      if (user) {
        const payload: Payload = this.jwtService.createPayload(
          user.email,
          true,
          user.id,
        );
        const refreshToken = this.jwtService.generateRefreshToken(payload);
        await this.cacheManager.set(refreshToken, user.id, {
          ttl: refreshTokenExpirationInCache,
        });

        return {
          access_token: this.jwtService.sign(payload),
          refresh_token: refreshToken,
        };
      } else {
        throw new UnauthorizedException('Error in OAuth login');
      }
    } catch (e) {
      throw e;
    }
  }

  async kakaoAuthorize(): Promise<KakaoAuthorizeOutput> {
    try {
      const kakaoAuthorizeUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${process.env.KAKAO_REST_API_KEY}&redirect_uri=${process.env.KAKAO_REDIRECT_URI_LOGIN}&response_type=code`;
      const {
        request: {
          res: { responseUrl },
        },
      } = await axios
        .get(kakaoAuthorizeUrl)
        .then((res) => {
          return res;
        })
        .catch((e) => {
          throw new BadRequestException(e.message);
        });
      return { url: responseUrl };
    } catch (e) {
      throw e;
    }
  }

  /*
   * Get user info from Kakao Auth Server then create account,
   * login and return access token and refresh token
   */
  async kakaoOauth({ code }: LoginWithKakaoDto): Promise<LoginOutput> {
    try {
      const { access_token } = await this.oauthUtil.getKakaoAccessToken(code);

      const { userInfo } = await this.oauthUtil.getKakaoUserInfo(access_token);

      const email = userInfo.kakao_account.email;
      if (!email) {
        throw new BadRequestException('Please Agree to share your email');
      }

      const { user, exist } = await this.userRepository.getOrCreateAccount({
        email,
        name: userInfo.kakao_account.profile.nickname,
        profileImage: userInfo.kakao_account.profile?.profile_image_url,
        password: CryptoJS.SHA256(email + process.env.KAKAO_JS_KEY).toString(),
      });

      // 회원가입인 경우 기본 카테고리 생성 작업 진행
      if (exist === 0) {
        await this.categoryRepository.createDefaultCategories(user);
      }

      return this.oauthLogin(user.email);
    } catch (e) {
      throw e;
    }
  }

  // Login with Google account info
  async googleOauth({
    email,
    name,
    picture,
  }: googleUserInfo): Promise<LoginOutput> {
    try {
      const { user, exist } = await this.userRepository.getOrCreateAccount({
        email,
        name,
        profileImage: picture,
        password: CryptoJS.SHA256(
          email + process.env.GOOGLE_CLIENT_ID,
        ).toString(),
      });

      // 회원가입인 경우 기본 카테고리 생성 작업 진행
      if (exist === 0) {
        await this.categoryRepository.createDefaultCategories(user);
      }

      return this.oauthLogin(user.email);
    } catch (e) {
      throw e;
    }
  }
}
