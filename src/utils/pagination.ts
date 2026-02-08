export const DEFAULT_PAGE_SIZE = 8;

export const getTotalPages = (totalItems: number, pageSize: number) =>
  Math.max(1, Math.ceil(totalItems / pageSize));

export const clampPage = (page: number, totalItems: number, pageSize: number) =>
  Math.min(Math.max(1, page), getTotalPages(totalItems, pageSize));

export const paginateItems = <T>(items: T[], page: number, pageSize: number) => {
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    safePage,
    totalPages: getTotalPages(items.length, pageSize),
    pageItems: items.slice(start, start + pageSize),
  };
};
