import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { getLinkInfo, getOrCreateCategory, init } from 'src/utils';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AddCategoryOutput,
  DeleteCategoryOutput,
  UpdateCategoryBodyDto,
  UpdateCategoryOutput,
} from './dtos/category.dto';
import {
  AddContentBodyDto,
  AddContentOutput,
  AddMultipleContentsBodyDto,
  DeleteContentOutput,
  toggleFavoriteOutput,
  UpdateContentBodyDto,
} from './dtos/content.dto';
import { Category } from './entities/category.entity';
import { Content } from './entities/content.entity';

@Injectable()
export class ContentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async addContent(
    user: User,
    {
      link,
      title,
      comment,
      deadline,
      favorite,
      categoryName,
    }: AddContentBodyDto,
  ): Promise<AddContentOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await this.users.findOne({
        where: { id: user.id },
        relations: {
          contents: {
            category: true,
          },
          categories: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      // get og tag info from link
      const {
        title: linkTitle,
        description,
        coverImg,
      } = await getLinkInfo(link);
      title = title || linkTitle;

      // Get or create category
      const category = categoryName
        ? await getOrCreateCategory(categoryName, queryRunnerManager)
        : null;

      // Check if content already exists in same category
      if (
        userInDb.contents.filter(
          (content) => content.link === link && content.category === category,
        )[0]
      ) {
        throw new ConflictException(
          'Content with that link already exists in same category.',
        );
      }

      const newContent = queryRunnerManager.create(Content, {
        link,
        title,
        coverImg,
        description,
        comment,
        deadline,
        category,
        ...(favorite && { favorite }),
      });
      await queryRunnerManager.save(newContent);
      userInDb.contents.push(newContent);
      categoryName ? userInDb.categories.push(category) : null;
      await queryRunnerManager.save(userInDb);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async addMultipleContents(
    user: User,
    { contentLinks }: AddMultipleContentsBodyDto,
  ): Promise<AddContentOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: true,
          categories: true,
        },
      });

      if (contentLinks.length > 0) {
        contentLinks.forEach(async (link) => {
          const { title, description, coverImg } = await getLinkInfo(link);

          // Check if content already exists in same category
          if (
            userInDb.contents.filter(
              (content) => content.link === link && !content.category,
            )[0]
          ) {
            throw new ConflictException(
              'Content with that link already exists in same category.',
            );
          }

          const newContent = queryRunnerManager.create(Content, {
            link,
            title,
            coverImg,
            description,
          });
          await queryRunnerManager.save(newContent);
          userInDb.contents.push(newContent);
          await queryRunnerManager.save(userInDb);
        });

        await queryRunner.commitTransaction();
      }

      return;
    } catch (e) {
      console.log(e);
      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async updateContent(
    user: User,
    {
      id,
      link,
      title,
      description,
      comment,
      deadline,
      favorite,
      categoryName,
    }: UpdateContentBodyDto,
  ): Promise<AddContentOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;

    const newContentObj = {
      link,
      title,
      description,
      comment,
      deadline,
      favorite,
    };
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: {
            category: true,
          },
          categories: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      const content = userInDb.contents.filter(
        (content) => content.id === id,
      )[0];
      if (!content) {
        throw new NotFoundException('Content not found.');
      }

      // Check if content already exists in same category
      const contentThatSameLinkAndCategory = userInDb.contents.filter(
        (contentInFilter) =>
          contentInFilter.link === content.link &&
          contentInFilter.id !== id &&
          contentInFilter?.category?.name === categoryName,
      )[0];
      if (contentThatSameLinkAndCategory) {
        throw new ConflictException(
          'Content with that link already exists in same category.',
        );
      }

      // update content
      let category: Category = null;
      if (categoryName) {
        category = await getOrCreateCategory(categoryName, queryRunnerManager);
        if (!userInDb.categories.includes(category)) {
          userInDb.categories.push(category);
          await queryRunnerManager.save(userInDb);
        }

        // // Update user categories
        // if (content.category) {
        //   const userCurrentCategories = userInDb.categories.filter(
        //     (category) => category.name === content.category.name,
        //   );
        //   if (userCurrentCategories.length === 1) {
        //     userInDb.categories = userInDb.categories.filter(
        //       (category) => category.name !== content.category.name,
        //     );
        //   }
        // }
      }

      queryRunnerManager.save(Content, [
        { id: content.id, ...newContentObj, ...(category && { category }) },
      ]);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      console.log(e);
      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async toggleFavorite(
    user: User,
    contentId: number,
  ): Promise<toggleFavoriteOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      const content = userInDb.contents.filter(
        (content) => content.id === contentId,
      )[0];

      if (!content) {
        throw new NotFoundException('Content not found.');
      }

      content.favorite = !content.favorite;
      await queryRunnerManager.save(content);
      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async deleteContent(
    user: User,
    contentId: number,
  ): Promise<DeleteContentOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: true,
          categories: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      const content = userInDb.contents.filter(
        (content) => content.id === contentId,
      )[0];

      if (!content) {
        throw new NotFoundException('Content not found.');
      }

      // // Update user categories
      // if (content.category) {
      //   const userCurrentCategories = userInDb.categories.filter(
      //     (category) => category.name === content.category.name,
      //   );
      //   if (userCurrentCategories.length === 1) {
      //     userInDb.categories = userInDb.categories.filter(
      //       (category) => category.name !== content.category.name,
      //     );
      //   }
      //   queryRunnerManager.save(userInDb);
      // }

      // delete content
      queryRunnerManager.delete(Content, content.id);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }
}

@Injectable()
export class CategoryService {
  constructor(private readonly dataSource: DataSource) {}

  async addCategory(
    user: User,
    categoryName: string,
  ): Promise<AddCategoryOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          categories: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      const category = await getOrCreateCategory(
        categoryName,
        queryRunnerManager,
      );
      if (userInDb.categories.includes(category)) {
        throw new ConflictException('Category already exists');
      }
      userInDb.categories.push(category);
      await queryRunnerManager.save(userInDb);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.log(e);

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async updateCategory(
    user: User,
    { originalName, name }: UpdateCategoryBodyDto,
  ): Promise<UpdateCategoryOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: {
            category: true,
          },
          categories: true,
        },
      });
      // Check if user exists
      if (!userInDb) {
        throw new NotFoundException('User not found.');
      }

      // Get or create category
      const category = await getOrCreateCategory(name, queryRunnerManager);

      // Check if user has category
      if (
        !userInDb.categories.filter(
          (category) => category.name === originalName,
        )[0]
      ) {
        throw new NotFoundException("Category doesn't exists in current user.");
      }
      // Check if user has category with same name
      if (userInDb.categories.filter((category) => category.name === name)[0]) {
        throw new ConflictException(
          'Category with that name already exists in current user.',
        );
      }
      // Update and delete previous category
      userInDb.categories.push(category);
      userInDb.contents.forEach((content) => {
        if (content.category && content.category.name === originalName) {
          content.category = category;
          queryRunnerManager.save(content);
        }
      });
      userInDb.categories = userInDb.categories.filter(
        (category) => category.name !== originalName,
      );
      await queryRunnerManager.save(userInDb);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }

  async deleteCategory(
    user: User,
    categoryId: number,
  ): Promise<DeleteCategoryOutput> {
    const queryRunner = await init(this.dataSource);
    const queryRunnerManager: EntityManager = await queryRunner.manager;
    try {
      const userInDb = await queryRunnerManager.findOne(User, {
        where: { id: user.id },
        relations: {
          contents: {
            category: true,
          },
          categories: true,
        },
      });
      if (!userInDb) {
        throw new NotFoundException('User not found');
      }

      const category = userInDb.categories.filter(
        (category) => category.id === categoryId,
      )[0];

      if (!category) {
        throw new NotFoundException('Category not found.');
      }

      userInDb.categories = userInDb.categories.filter(
        (category) => category.id !== categoryId,
      );
      userInDb.contents.forEach((content) => {
        if (content.category && content.category.id === categoryId) {
          content.category = null;
          queryRunnerManager.save(content);
        }
      });
      await queryRunnerManager.save(userInDb);

      await queryRunner.commitTransaction();

      return;
    } catch (e) {
      await queryRunner.rollbackTransaction();

      throw new HttpException(e.message, e.status ? e.status : 500);
    }
  }
}
