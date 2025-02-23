import {
  Body,
  Controller,
  Delete,
  Post,
  Param,
  UseGuards,
  ParseIntPipe,
  Patch,
  Get,
  UseInterceptors,
  ParseBoolPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.decorator';
import { JwtAuthGuard } from '../auth/jwt/jwt.guard';
import { TransactionInterceptor } from '../common/interceptors/transaction.interceptor';
import { TransactionManager } from '../common/transaction.decorator';
import { User } from '../users/entities/user.entity';
import { EntityManager } from 'typeorm';
import { CategoryService, ContentsService } from './contents.service';
import {
  AddCategoryBodyDto,
  AddCategoryOutput,
  AutoCategorizeBodyDto,
  AutoCategorizeOutput,
  DeleteCategoryOutput,
  UpdateCategoryBodyDto,
  UpdateCategoryOutput,
} from './dtos/category.dto';
import {
  AddContentBodyDto,
  AddContentOutput,
  AddMultipleContentsBodyDto,
  checkReadFlagOutput,
  DeleteContentOutput,
  SummarizeContentBodyDto,
  SummarizeContentOutput,
  toggleFavoriteOutput,
  UpdateContentBodyDto,
  UpdateContentOutput,
} from './dtos/content.dto';
import {
  LoadFrequentCategoriesOutput,
  LoadPersonalCategoriesOutput,
} from './dtos/load-personal-categories.dto';
import { ErrorOutput } from '../common/dtos/output.dto';
import {
  LoadFavoritesOutput,
  LoadPersonalContentsOutput,
} from './dtos/load-personal-contents.dto';
import { LoadReminderCountOutput } from './dtos/load-personal-remider-count.dto';

@Controller('contents')
@ApiTags('Contents')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard)
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @ApiOperation({
    summary: '콘텐츠 추가',
    description: '콘텐츠을 추가하는 메서드',
  })
  @ApiCreatedResponse({
    description: '콘텐츠 추가 성공 여부를 반환한다.',
    type: AddContentOutput,
  })
  @ApiConflictResponse({
    description: '같은 카테고리 내에 동일한 링크의 콘텐츠가 존재할 경우',
    type: ErrorOutput,
  })
  @Post()
  @UseInterceptors(TransactionInterceptor)
  async addContent(
    @AuthUser() user: User,
    @Body() content: AddContentBodyDto,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<AddContentOutput> {
    return this.contentsService.addContent(user, content, queryRunnerManager);
  }

  @ApiOperation({
    summary: '다수의 콘텐츠 추가',
    description: `다수의 콘텐츠를 추가하는 메서드`,
  })
  @ApiCreatedResponse({
    description: '콘텐츠 추가 성공 여부를 반환한다.',
    type: AddContentOutput,
  })
  @ApiConflictResponse({
    description: '같은 카테고리 내에 동일한 링크의 콘텐츠가 존재할 경우',
    type: ErrorOutput,
  })
  @Post('multiple')
  @UseInterceptors(TransactionInterceptor)
  async addMultipleContents(
    @AuthUser() user: User,
    @Body() contentLinks: AddMultipleContentsBodyDto,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<AddContentOutput> {
    return this.contentsService.addMultipleContents(
      user,
      contentLinks,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '콘텐츠 정보 수정',
    description: '콘텐츠을 수정하는 메서드',
  })
  @ApiCreatedResponse({
    description: '콘텐츠 수정 성공 여부를 반환한다.',
    type: UpdateContentOutput,
  })
  @ApiConflictResponse({
    description: '동일한 링크의 콘텐츠가 같은 카테고리 내에 존재할 경우',
    type: ErrorOutput,
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 콘텐츠 또는 유저인 경우',
    type: ErrorOutput,
  })
  @Patch()
  @UseInterceptors(TransactionInterceptor)
  async updateContent(
    @AuthUser() user: User,
    @Body() content: UpdateContentBodyDto,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<UpdateContentOutput> {
    return this.contentsService.updateContent(
      user,
      content,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '즐겨찾기 등록 및 해제',
    description: '즐겨찾기에 등록 및 해제하는 메서드',
  })
  @ApiOkResponse({
    description: '즐겨찾기 등록 및 해제 성공 여부를 반환한다.',
    type: toggleFavoriteOutput,
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 콘텐츠 또는 유저인 경우',
    type: ErrorOutput,
  })
  @Patch(':contentId/favorite')
  @UseInterceptors(TransactionInterceptor)
  async toggleFavorite(
    @AuthUser() user: User,
    @Param('contentId', new ParseIntPipe()) contentId: number,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<toggleFavoriteOutput> {
    return this.contentsService.toggleFavorite(
      user,
      contentId,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '콘텐츠 삭제',
    description: '콘텐츠을 삭제하는 메서드',
  })
  @ApiOkResponse({
    description: '콘텐츠 삭제 성공 여부를 반환한다.',
    type: DeleteContentOutput,
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 콘텐츠 또는 유저인 경우',
    type: ErrorOutput,
  })
  @Delete(':contentId')
  @UseInterceptors(TransactionInterceptor)
  async deleteContent(
    @AuthUser() user: User,
    @Param('contentId', new ParseIntPipe()) contentId: number,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<DeleteContentOutput> {
    return this.contentsService.deleteContent(
      user,
      contentId,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '자신의 아티클 조회',
    description: '자신의 아티클을 조회하는 메서드',
  })
  @ApiQuery({
    name: 'categoryId',
    description: '카테고리 아이디(기입하지 않을 시 전체를 불러온다.)',
    type: Number,
    required: false,
  })
  @ApiOkResponse({
    description: `아티클 목록을 반환한다. 만약 categoryId가 없을 시 전부를 반환한다.`,
    type: LoadPersonalContentsOutput,
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get()
  async loadPersonalContents(
    @AuthUser() user: User,
    @Query('categoryId') categoryId?: number,
  ): Promise<LoadPersonalContentsOutput> {
    if (categoryId) categoryId = +categoryId;
    return this.contentsService.loadPersonalContents(user, categoryId);
  }

  @ApiOperation({
    summary: '자신의 즐겨찾기 조회',
    description: '자신의 즐겨찾기를 조회하는 메서드',
  })
  @ApiOkResponse({
    description: '즐겨찾기 목록을 반환한다.',
    type: LoadFavoritesOutput,
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get('favorite')
  async loadFavorites(@AuthUser() user: User): Promise<LoadFavoritesOutput> {
    return this.contentsService.loadFavorites(user);
  }

  @ApiOperation({
    summary: '자신의 리마인더 개수 조회',
    description: '자신의 리마인더 개수를 조회하는 메서드',
  })
  @ApiOkResponse({
    description: '설정되어있는 리마인더 개수를 반환한다.',
    type: LoadReminderCountOutput,
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get('reminder-count')
  async loadReminderCount(
    @AuthUser() user: User,
  ): Promise<LoadReminderCountOutput> {
    return this.contentsService.loadReminderCount(user);
  }

  @ApiOperation({
    summary: '콘텐츠 문서 요약',
    description: '콘텐츠의 문서를 요약하는 메서드',
  })
  @ApiOkResponse({
    description: '콘텐츠 문서 요약 성공 여부를 반환한다.',
    type: SummarizeContentOutput,
  })
  @ApiNotFoundResponse({
    description:
      '존재하지 않는 콘텐츠 또는 유저거나 접근이 불가능한 페이지인 경우',
    type: ErrorOutput,
  })
  @ApiBadRequestResponse({
    description: '잘못된 요청을 보냈을 경우',
    type: ErrorOutput,
  })
  @Get(':contentId/summarize')
  async summarizeContent(
    @AuthUser() user: User,
    @Param('contentId', new ParseIntPipe()) contentId: number,
  ): Promise<SummarizeContentOutput> {
    return this.contentsService.summarizeContent(user, contentId);
  }

  // @ApiOperation({
  //   summary: '간편 문서 요약',
  //   description: '성능 테스트를 위해 만든 간편 문서 요약 메서드',
  // })
  // @ApiOkResponse({
  //   description: '간편 문서 요약 성공 여부를 반환한다.',
  //   type: SummarizeContentOutput,
  // })
  // @ApiBadRequestResponse({
  //   description: 'naver 서버에 잘못된 요청을 보냈을 경우',
  // })
  // @Post('summarize')
  // async testSummarizeContent(
  //   @Body() content: SummarizeContentBodyDto,
  // ): Promise<SummarizeContentOutput> {
  //   return this.contentsService.testSummarizeContent(content);
  // }
}

@Controller('test')
@ApiTags('Test')
export class TestController {
  constructor(
    private readonly contentsService: ContentsService,
    private readonly categoryService: CategoryService,
  ) {}

  @ApiOperation({
    summary: '간편 문서 요약',
    description: '성능 테스트를 위해 만든 간편 문서 요약 메서드',
  })
  @ApiOkResponse({
    description: '간편 문서 요약 성공 여부를 반환한다.',
    type: SummarizeContentOutput,
  })
  @ApiBadRequestResponse({
    description: 'naver 서버에 잘못된 요청을 보냈을 경우',
    type: ErrorOutput,
  })
  @Post('summarize')
  async testSummarizeContent(
    @Body() content: SummarizeContentBodyDto,
  ): Promise<SummarizeContentOutput> {
    return this.contentsService.testSummarizeContent(content);
  }

  @ApiOperation({
    summary: '아티클 카테고리 자동 지정 (테스트용)',
    description: 'url을 넘기면 적절한 아티클 카테고리를 반환하는 메서드',
  })
  @Post('auto-categorize')
  async autoCategorize(
    @Body() autoCategorizeBody: AutoCategorizeBodyDto,
  ): Promise<AutoCategorizeOutput> {
    return this.categoryService.autoCategorizeForTest(autoCategorizeBody);
  }
}

@Controller('categories')
@ApiTags('Category')
@ApiBearerAuth('Authorization')
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @ApiOperation({
    summary: '카테고리 추가',
    description: '카테고리를 추가하는 메서드',
  })
  @ApiCreatedResponse({
    description: '카테고리 추가 성공 여부를 반환한다.',
    type: AddCategoryOutput,
  })
  @ApiConflictResponse({
    description: '동일한 이름의 카테고리가 존재할 경우',
    type: ErrorOutput,
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 것일 경우',
    type: ErrorOutput,
  })
  @Post()
  @UseInterceptors(TransactionInterceptor)
  async addCategory(
    @AuthUser() user: User,
    @Body() addCategoryBody: AddCategoryBodyDto,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<AddCategoryOutput> {
    return this.categoryService.addCategory(
      user,
      addCategoryBody,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '카테고리 수정',
    description: '카테고리 이름을 수정하는 메서드',
  })
  @ApiCreatedResponse({
    description: '카테고리 수정 성공 여부를 반환한다.',
    type: UpdateCategoryOutput,
  })
  @Patch()
  @UseInterceptors(TransactionInterceptor)
  async updateCategory(
    @AuthUser() user: User,
    @Body() updateCategoryBody: UpdateCategoryBodyDto,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<UpdateCategoryOutput> {
    return this.categoryService.updateCategory(
      user,
      updateCategoryBody,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '카테고리 삭제',
    description: '카테고리를 삭제하는 메서드',
  })
  @ApiOkResponse({
    description: '카테고리 삭제 성공 여부를 반환한다.',
    type: DeleteCategoryOutput,
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 카테고리를 삭제하려고 할 경우',
    type: ErrorOutput,
  })
  @Delete(':categoryId')
  @UseInterceptors(TransactionInterceptor)
  async deleteCategory(
    @AuthUser() user: User,
    @Param('categoryId', new ParseIntPipe()) categoryId: number,
    @Query('deleteContentFlag', new ParseBoolPipe()) deleteContentFlag: boolean,
    @TransactionManager() queryRunnerManager: EntityManager,
  ): Promise<DeleteCategoryOutput> {
    return this.categoryService.deleteCategory(
      user,
      categoryId,
      deleteContentFlag,
      queryRunnerManager,
    );
  }

  @ApiOperation({
    summary: '자신의 카테고리 목록 조회',
    description: '자신의 카테고리 목록을 조회하는 메서드',
  })
  @ApiOkResponse({
    description: '카테고리 목록을 반환한다.',
    type: LoadPersonalCategoriesOutput,
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get()
  async loadPersonalCategories(
    @AuthUser() user: User,
  ): Promise<LoadPersonalCategoriesOutput> {
    return this.categoryService.loadPersonalCategories(user);
  }

  @ApiOperation({
    summary: '자주 저장한 카테고리 조회',
    description: '자주 저장한 카테고리를 3개까지 조회하는 메서드',
  })
  @ApiOkResponse({
    description: '자주 저장한 카테고리를 최대 3개까지 반환한다.',
    type: LoadFrequentCategoriesOutput,
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get('frequent')
  async loadFrequentCategories(
    @AuthUser() user: User,
  ): Promise<LoadFrequentCategoriesOutput> {
    return this.categoryService.loadFrequentCategories(user);
  }

  @ApiOperation({
    summary: '아티클 카테고리 자동 지정',
    description:
      '아티클에 적절한 카테고리를 유저의 카테고리 목록에서 찾는 메서드',
  })
  @ApiBearerAuth('Authorization')
  @UseGuards(JwtAuthGuard)
  @Get('auto-categorize')
  async autoCategorize(
    @AuthUser() user: User,
    @Query('link') link: string,
  ): Promise<AutoCategorizeOutput> {
    return this.categoryService.autoCategorize(user, link);
  }
}
