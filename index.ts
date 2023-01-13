import * as dotenv from 'dotenv'
dotenv.config()
import { Client } from 'pg';
import sharp from 'sharp'
import { encode } from "blurhash";
const CDN_HOST = "https://ck-cdn.annatarhe.cn"

const pgClient = new Client({
	connectionString: process.env.PG_URL
})

await pgClient.connect()

pgClient.query(`
SELECT
	a.id,
	a.image
FROM
	wenqu_book AS a
	FULL OUTER JOIN image_infos AS b ON a.id = b.book_image_info
WHERE
	a.id > 100
	AND b.id IS NOT NULL
ORDER BY
	a.id DESC
LIMIT 10
`, [1 << 29])