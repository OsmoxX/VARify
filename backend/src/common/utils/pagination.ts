/** Paginacja w stylu DRF PageNumberPagination (PAGE_SIZE=20). */
export const PAGE_SIZE = 20;

export interface Paginated<T> {
  count: number;
  page: number;
  pageSize: number;
  next: number | null;
  previous: number | null;
  results: T[];
}

export function pageParams(page?: number, pageSize = PAGE_SIZE) {
  const p = Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
  return { page: p, skip: (p - 1) * pageSize, take: pageSize };
}

export function paginated<T>(results: T[], count: number, page: number, pageSize = PAGE_SIZE): Paginated<T> {
  const last = Math.max(1, Math.ceil(count / pageSize));
  return {
    count,
    page,
    pageSize,
    next: page < last ? page + 1 : null,
    previous: page > 1 ? page - 1 : null,
    results,
  };
}
