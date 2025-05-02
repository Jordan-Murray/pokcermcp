import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import { Pool } from "pg";
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: process.env.DB_PASSWORD,
    database: "PT4 DB",
  });


const GetHandsParams = z.object({
  limit: z.number().int().positive().default(5),
});

type GetHandsParams = z.infer<typeof GetHandsParams>;

async function fetchLastHands(pool: Pool, limit: number): Promise<string[]> {
    const { rows } = await pool.query<{ history: string }>(`
      SELECT history
        FROM cash_hand_histories
       ORDER BY id_hand DESC
       LIMIT $1
    `, [limit]);
    return rows.map(r => r.history);
  }

  async function getRecentHandsParsed(pool: Pool, limit: number): Promise<string[]> {
    const raws = await fetchLastHands(pool, limit);
    return raws
  }

  async function getWorstHands(pool: Pool): Promise<string[]> {
    const { rows } = await pool.query<{ history: string }>(`
        WITH last_500 AS ( 
        SELECT
            hps.id_hand,
            cs.hand_no,
            cs.date_played    AS hand_date,
            hps.amt_won
        FROM cash_hand_player_statistics AS hps
        JOIN cash_hand_summary           AS cs
            ON hps.id_hand = cs.id_hand
        WHERE hps.id_player = 4
        ORDER BY cs.date_played DESC
        LIMIT 500
        ),
        worst_10 AS (
        SELECT *
            FROM last_500
        WHERE amt_won < 0
        ORDER BY amt_won ASC
        LIMIT 10
        )
        SELECT
        w.id_hand,
        w.hand_no,
        w.hand_date,
        w.amt_won,
        chh.history
        FROM worst_10 AS w
        JOIN cash_hand_histories AS chh
            ON chh.id_hand = w.id_hand
        ORDER BY w.amt_won ASC;
        `);
    return rows.map(r => r.history);
  }

  const server = new McpServer({
    name: "pokermcp",
    version: "1.0.0",
    capabilities: {
      resources: {},    
      tools: {},
    }
  });

server.tool(
    "getRecentHands",
    {
        hands: z.string().describe("The number of hands to get")
    },
    async ({hands}) => {
        return {
            content:[{
                type: "text",
                text: JSON.stringify(await getRecentHandsParsed(pool, Number(hands)))
            }]
        }
    }
)

server.tool(
    "getWorstHands",
    async () => {
        return {
            content:[{
                type: "text",
                text: JSON.stringify(await getWorstHands(pool))
            }]
        }
    }
)

const transport = new StdioServerTransport();

await server.connect(transport);
