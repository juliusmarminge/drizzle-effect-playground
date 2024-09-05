import { NodeRuntime } from "@effect/platform-node"

import { sql } from "drizzle-orm"
import * as D from "drizzle-orm/mysql-core"
import { Array, Effect, Layer, Option } from "effect"
import * as MySqlDrizzle from "./drizzle-effect";
import * as mysql2 from "mysql2/promise"
import * as PlanetScale from "@planetscale/database"

const users = D.mysqlTable("users", {
  id: D.int("id").primaryKey(),
  name: D.text("name")
})

const schema = {
    users
}

const program = Effect.gen(function*() {
  yield* Effect.log("Welcome to the Effect Playground!")

  const db = yield* MySqlDrizzle.Client
  yield* db.execute(sql`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)`)

  yield* db.delete(users)
  yield* db.insert(users).values({ id: 1, name: "Alice" })

  const results = yield* db.select().from(users)
  console.log(results)

  const alice = yield* db.select().from(users).pipe(Array.head, Option.getOrThrowWith(() => new MySqlDrizzle.EmptyQueryError()))
}).pipe(Effect.withSpan("program", {
  attributes: { source: "Playground" }
}))

// 

console.log("Running program with Mysql2 driver")
const connection = await mysql2.createConnection("mysql://admin:password@localhost:3306/db")
program.pipe(
  Effect.provide(Layer.effect(MySqlDrizzle.Client, MySqlDrizzle.make(connection))),
  NodeRuntime.runMain
)

// 

// console.log("Running program with PlanetScale driver")
// const client = new PlanetScale.Client({
//     host: "localhost:3900",
//     username: "admin",
//     password: "password",
//     fetch: (input, init) => {
//       const url = new URL(input);
//       url.protocol = "http:";
//       return fetch(url.href, init);
//     },
//   });
// program.pipe(
//     Effect.provide(Layer.effect(MySqlDrizzle.Client, MySqlDrizzle.make(client))),
//     NodeRuntime.runMain
// )