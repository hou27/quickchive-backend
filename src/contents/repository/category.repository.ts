import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category } from '../entities/category.entity';
import { CategoryUtil } from '../util/category.util';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class CategoryRepository extends Repository<Category> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly categoryUtil: CategoryUtil,
  ) {
    super(Category, dataSource.createEntityManager());
  }

  /**
   * category를 생성하거나, 이미 존재하는 category를 가져옴
   * content service의 method 내에서 중복되는 로직을 분리함
   *
   * @param categoryName
   * @param parentId
   * @param userInDb
   * @param queryRunnerManager
   * @returns category
   */
  async getOrCreateCategory(
    categoryName: string,
    parentId: number | undefined,
    userInDb: User,
    queryRunnerManager: EntityManager,
  ): Promise<Category> {
    // generate category name and slug
    const { categorySlug } = this.categoryUtil.generateSlug(categoryName);

    if (parentId) {
      // category depth should be 3
      let currentParentId: number | undefined = parentId;
      let parentCategory: Category | null;
      for (let i = 0; i < 2; i++) {
        if (currentParentId === null) break;
        parentCategory = await queryRunnerManager.findOne(Category, {
          where: { id: currentParentId },
        });
        if (i === 1 && parentCategory?.parentId !== null) {
          throw new ConflictException('Category depth should be 3');
        }
        if (parentCategory?.parentId)
          currentParentId = parentCategory?.parentId;
        else break;
      }
    }
    // check if category exists in user's categories
    let category: Category | undefined = userInDb.categories?.find(
      (category) =>
        category.slug === categorySlug && category.parentId == parentId,
    );

    // if category doesn't exist, create it
    if (!category) {
      // if parent id exists, get parent category
      const parentCategory: Category | null = parentId
        ? await queryRunnerManager.findOne(Category, {
            where: { id: parentId },
          })
        : null;
      // if parent category doesn't exist, throw error
      if (!parentCategory && parentId) {
        throw new NotFoundException('Parent category not found');
      }

      category = await queryRunnerManager.save(
        queryRunnerManager.create(Category, {
          slug: categorySlug,
          name: categoryName,
          parentId: parentCategory?.id,
          user: userInDb,
        }),
      );

      userInDb.categories?.push(category);
      await queryRunnerManager.save(userInDb);
    }

    return category;
  }

  /**
   * 대 카테고리는 유저 당 10개까지만 생성 가능
   * 해당 유저의 대 카테고리 개수를 확인하고, 10개 이상이면 true 반환
   * @param user.id
   * @returns boolean
   */
  async isOverCategoryLimit(user: User): Promise<boolean> {
    const categoryCount = await this.createQueryBuilder('category')
      .where('category.userId = :id', { id: user.id })
      .andWhere('category.parentId IS NULL')
      .getCount();

    return categoryCount >= 10;
  }

  async createDefaultCategories(user: User): Promise<void> {
    const defaultCategories = ['꿀팁', '쇼핑'];

    await this.createQueryBuilder('category')
      .insert()
      .into(Category)
      .values(
        defaultCategories.map((categoryName) => ({
          name: categoryName,
          slug: this.categoryUtil.generateSlug(categoryName).categorySlug,
          user: user,
        })),
      )
      .execute();
  }
}
