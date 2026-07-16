import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getFilteredGames,
    getAllCategories,
    getAllPublishers,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

interface FilterFixture {
    strategyId: number;
    puzzleId: number;
    rpgId: number;
    pubAId: number;
    pubBId: number;
}

async function seedFilterFixture(db: Database): Promise<FilterFixture> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle' })
        .returning({ id: categories.id });
    const [rpg] = await db
        .insert(categories)
        .values({ name: 'RPG' })
        .returning({ id: categories.id });
    const [pubA] = await db
        .insert(publishers)
        .values({ name: 'Alpha Games' })
        .returning({ id: publishers.id });
    const [pubB] = await db
        .insert(publishers)
        .values({ name: 'Beta Studios' })
        .returning({ id: publishers.id });

    // Deliberate mix so each filter path is exercised.
    const rows: Array<{ title: string; categoryId: number; publisherId: number }> = [
        { title: 'Alpha Strategy', categoryId: strategy.id, publisherId: pubA.id },
        { title: 'Beta Strategy', categoryId: strategy.id, publisherId: pubB.id },
        { title: 'Alpha Puzzle', categoryId: puzzle.id, publisherId: pubA.id },
        { title: 'Beta RPG', categoryId: rpg.id, publisherId: pubB.id },
    ];
    for (const row of rows) {
        await db.insert(games).values({
            title: row.title,
            description: `desc for ${row.title}`,
            starRating: 4.0,
            categoryId: row.categoryId,
            publisherId: row.publisherId,
        });
    }

    return {
        strategyId: strategy.id,
        puzzleId: puzzle.id,
        rpgId: rpg.id,
        pubAId: pubA.id,
        pubBId: pubB.id,
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});

describe('game filtering', () => {
    let db: Database;
    let fx: FilterFixture;

    beforeEach(async () => {
        db = await createTestDatabase();
        fx = await seedFilterFixture(db);
    });

    it('returns every game (ordered) when no filters are provided', async () => {
        const result = await getFilteredGames(db);
        expect(result.map((g) => g.title)).toEqual([
            'Alpha Puzzle',
            'Alpha Strategy',
            'Beta RPG',
            'Beta Strategy',
        ]);
    });

    it('filters by a single category id', async () => {
        const result = await getFilteredGames(db, { categoryIds: [fx.strategyId] });
        expect(result.map((g) => g.title)).toEqual(['Alpha Strategy', 'Beta Strategy']);
    });

    it('ORs within the category facet when multiple category ids are given', async () => {
        const result = await getFilteredGames(db, {
            categoryIds: [fx.strategyId, fx.puzzleId],
        });
        expect(result.map((g) => g.title)).toEqual([
            'Alpha Puzzle',
            'Alpha Strategy',
            'Beta Strategy',
        ]);
    });

    it('filters by a single publisher id', async () => {
        const result = await getFilteredGames(db, { publisherIds: [fx.pubAId] });
        expect(result.map((g) => g.title)).toEqual(['Alpha Puzzle', 'Alpha Strategy']);
    });

    it('ANDs the category and publisher facets when both are provided', async () => {
        const result = await getFilteredGames(db, {
            categoryIds: [fx.strategyId],
            publisherIds: [fx.pubBId],
        });
        expect(result.map((g) => g.title)).toEqual(['Beta Strategy']);
    });

    it('treats empty filter arrays as "no restriction"', async () => {
        const result = await getFilteredGames(db, { categoryIds: [], publisherIds: [] });
        expect(result).toHaveLength(4);
    });

    it('returns no games when the filter combination matches nothing', async () => {
        const result = await getFilteredGames(db, {
            categoryIds: [fx.rpgId],
            publisherIds: [fx.pubAId],
        });
        expect(result).toEqual([]);
    });

    it('returns no games for unknown ids', async () => {
        const result = await getFilteredGames(db, { categoryIds: [99999] });
        expect(result).toEqual([]);
    });
});

describe('category and publisher list helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all categories ordered by name', async () => {
        await seedFilterFixture(db);
        const cats = await getAllCategories(db);
        expect(cats.map((c) => c.name)).toEqual(['Puzzle', 'RPG', 'Strategy']);
        expect(cats[0]).toEqual({ id: expect.any(Number), name: 'Puzzle' });
    });

    it('returns all publishers ordered by name', async () => {
        await seedFilterFixture(db);
        const pubs = await getAllPublishers(db);
        expect(pubs.map((p) => p.name)).toEqual(['Alpha Games', 'Beta Studios']);
        expect(pubs[0]).toEqual({ id: expect.any(Number), name: 'Alpha Games' });
    });
});
