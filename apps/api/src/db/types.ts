export type QueryValue = string | number | boolean | Date | null | Buffer;

export type QueryParams = readonly (QueryValue | QueryValue[] | Record<string, unknown>)[];

export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface Queryable {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: QueryParams
  ): Promise<QueryResult<Row>>;
}

export interface Database extends Queryable {
  transaction<Result>(operation: (client: Queryable) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}
