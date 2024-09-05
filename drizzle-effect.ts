import { TypeIdError } from "@effect/platform/Error";
import type * as PlanetScale from "@planetscale/database";
import { MySqlSelectBase } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql-proxy";
import type {
  MySqlRemoteDatabase,
  RemoteCallback,
} from "drizzle-orm/mysql-proxy";
import { QueryPromise } from "drizzle-orm/query-promise";
import { Data } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import * as Predicate from "effect/Predicate";
import type * as mysql2 from "mysql2/promise";

/**
 * `client instanceof Client` doesn't work cause instanceof is stupid
 */
function isPlanetScaleClient(client: unknown): client is PlanetScale.Client {
  return (
    Predicate.isRecord(client) &&
    Predicate.isRecord(client.config) &&
    Predicate.isFunction(client.transaction) &&
    Predicate.isFunction(client.execute) &&
    Predicate.isFunction(client.connection)
  );
}

export const make = <TSchema extends Record<string, unknown>>(
  client: mysql2.Pool | mysql2.Connection | PlanetScale.Client,
) =>
  Effect.gen(function* () {
    let remoteCallback: RemoteCallback;

    if (isPlanetScaleClient(client)) {
      remoteCallback = async (sql, params, method) => {
        const result = await client.execute(sql, params, { as: "array" });

        return {
          rows:
            method === "all"
              ? result.rows
              : [
                  {
                    affectedRows: result.rowsAffected,
                    insertId: parseInt(result.insertId),
                  },
                ],
        };
      };
    } else {
      remoteCallback = async (sql, params, method) => {
        const result = await client.query({
          sql,
          values: params,
          rowsAsArray: method === "all",
        });

        return {
          rows: (method === "all" ? result[0] : result) as unknown[],
        };
      };
    }

    return drizzle(remoteCallback, { logger: true });
  });

export class Client extends Context.Tag("@effect/sql-drizzle/MysqlDrizzle")<
  Client,
  MySqlRemoteDatabase
>() {}

export const SqlErrorTypeId: unique symbol = Symbol.for("@effect/sql/SqlError");

export class SqlError extends TypeIdError(SqlErrorTypeId, "SqlError")<{
  cause: mysql2.QueryError | PlanetScale.DatabaseError;
  message?: string;
}> {}

export class EmptyQueryError extends Data.TaggedError("EmptyQueryError")<{
  message?: string;
}> {
  constructor(message = "No rows matching query") {
    super({ message });
  }
}

/**
 * Turn Drizzle's builder result into Effects instead of Promises
 */
const patch = (prototype: any) => {
  if (!(Effect.EffectTypeId in prototype)) {
    Object.assign(prototype, {
      ...Effectable.CommitPrototype,
      commit(this: QueryPromise<unknown>) {
        return Effect.tryPromise({
          try: () => this.execute(),
          catch: (cause) =>
            new SqlError({
              cause: cause as mysql2.QueryError | PlanetScale.DatabaseError,
              message: "Failed to execute QueryPromise",
            }),
        });
      },
    });
  }
};

patch(QueryPromise.prototype);
patch(MySqlSelectBase.prototype);

declare module "drizzle-orm" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}
