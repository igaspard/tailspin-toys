import { test, expect, type Page, type Locator } from '@playwright/test';

async function visibleGameCards(page: Page): Promise<Locator> {
  // Hidden cards use the `hidden` attribute which Playwright treats as not visible.
  return page.getByTestId('game-card').and(page.locator(':visible'));
}

async function firstCategoryFilter(
  page: Page,
): Promise<{ locator: Locator; id: string; name: string }> {
  const checkbox = page
    .getByTestId('filters-categories')
    .locator('input[data-filter="category"]')
    .first();
  const id = (await checkbox.getAttribute('value')) ?? '';
  const name = (await checkbox.locator('..').innerText()).trim();
  return { locator: checkbox, id, name };
}

async function firstPublisherFilter(
  page: Page,
): Promise<{ locator: Locator; id: string; name: string }> {
  const checkbox = page
    .getByTestId('filters-publishers')
    .locator('input[data-filter="publisher"]')
    .first();
  const id = (await checkbox.getAttribute('value')) ?? '';
  const name = (await checkbox.locator('..').innerText()).trim();
  return { locator: checkbox, id, name };
}

test.describe('Game filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('games-grid')).toBeVisible();
    await expect(page.getByTestId('game-filters')).toBeVisible();
  });

  test('filters the grid by a selected category', async ({ page }) => {
    const totalCards = await page.getByTestId('game-card').count();
    const { locator: catInput, id: categoryId } = await firstCategoryFilter(page);

    await catInput.check();

    const visibleCards = await visibleGameCards(page);
    const visibleCount = await visibleCards.count();
    expect(visibleCount).toBeGreaterThan(0);
    expect(visibleCount).toBeLessThanOrEqual(totalCards);

    // Every visible card must carry the selected category id.
    const categoryIds = await visibleCards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.categoryId ?? ''),
    );
    expect(new Set(categoryIds)).toEqual(new Set([categoryId]));

    await expect(page.getByTestId('filters-summary')).toContainText(
      `Showing ${visibleCount} of ${totalCards} games`,
    );
  });

  test('filters the grid by a selected publisher', async ({ page }) => {
    const totalCards = await page.getByTestId('game-card').count();
    const { locator: pubInput, id: publisherId } = await firstPublisherFilter(page);

    await pubInput.check();

    const visibleCards = await visibleGameCards(page);
    const visibleCount = await visibleCards.count();
    expect(visibleCount).toBeGreaterThan(0);
    expect(visibleCount).toBeLessThanOrEqual(totalCards);

    const publisherIds = await visibleCards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.publisherId ?? ''),
    );
    expect(new Set(publisherIds)).toEqual(new Set([publisherId]));
  });

  test('combines category and publisher filters with AND semantics', async ({ page }) => {
    const { locator: catInput, id: categoryId } = await firstCategoryFilter(page);
    await catInput.check();

    // Pick a publisher that at least one visible (category-matching) card carries.
    const publisherIdForCategory = await page
      .getByTestId('game-card')
      .and(page.locator(':visible'))
      .first()
      .getAttribute('data-publisher-id');
    expect(publisherIdForCategory).toBeTruthy();

    const publisherInput = page.locator(
      `input[data-filter="publisher"][value="${publisherIdForCategory}"]`,
    );
    await publisherInput.check();

    const visibleCards = await visibleGameCards(page);
    const attrs = await visibleCards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        category: (node as HTMLElement).dataset.categoryId ?? '',
        publisher: (node as HTMLElement).dataset.publisherId ?? '',
      })),
    );
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(attr.category).toBe(categoryId);
      expect(attr.publisher).toBe(publisherIdForCategory);
    }
  });

  test('clears all selected filters when Clear filters is clicked', async ({ page }) => {
    const totalCards = await page.getByTestId('game-card').count();
    const { locator: catInput } = await firstCategoryFilter(page);
    const { locator: pubInput } = await firstPublisherFilter(page);

    await catInput.check();
    await pubInput.check();

    await page.getByTestId('filters-clear').click();

    await expect(catInput).not.toBeChecked();
    await expect(pubInput).not.toBeChecked();
    const visibleCards = await visibleGameCards(page);
    expect(await visibleCards.count()).toBe(totalCards);
    await expect(page.getByTestId('filters-summary')).toContainText(
      `Showing all ${totalCards} games`,
    );
  });

  test('shows the no-matches empty state when no games match', async ({ page }) => {
    // Scan cards to find a category/publisher pair that share no games.
    const attrs = await page.getByTestId('game-card').evaluateAll((nodes) =>
      nodes.map((node) => ({
        category: (node as HTMLElement).dataset.categoryId ?? '',
        publisher: (node as HTMLElement).dataset.publisherId ?? '',
      })),
    );

    const uniqueCategories = Array.from(new Set(attrs.map((a) => a.category))).filter(Boolean);
    const uniquePublishers = Array.from(new Set(attrs.map((a) => a.publisher))).filter(Boolean);
    const pairs = new Set(attrs.map((a) => `${a.category}::${a.publisher}`));

    let categoryId = '';
    let publisherId = '';
    for (const cat of uniqueCategories) {
      for (const pub of uniquePublishers) {
        if (!pairs.has(`${cat}::${pub}`)) {
          categoryId = cat;
          publisherId = pub;
          break;
        }
      }
      if (categoryId) break;
    }
    test.skip(
      !categoryId || !publisherId,
      'Seed data has every category/publisher pair represented; cannot force an empty state.',
    );

    await page.locator(`input[data-filter="category"][value="${categoryId}"]`).check();
    await page.locator(`input[data-filter="publisher"][value="${publisherId}"]`).check();

    const visibleCards = await visibleGameCards(page);
    expect(await visibleCards.count()).toBe(0);
    await expect(page.getByTestId('games-no-matches')).toBeVisible();
    await expect(page.getByTestId('filters-summary')).toContainText(
      'No games match the selected filters',
    );
  });
});
