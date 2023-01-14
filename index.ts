import * as dotenv from 'dotenv'
import pino from 'pino'
dotenv.config()

import pg from 'pg'
import sharp from 'sharp'
import { encode } from "blurhash";
import { image_infos, PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const CDN_HOST = "https://ck-cdn.annatarhe.cn"
const CHUNK_SIZE = 100

type BookLite = {
	id: number
	image: string
}

const logger = pino(pino.destination('./mp-bash.log'))

async function ensurePG() {
	const pgClient = new pg.Client({
		connectionString: process.env.DATABASE_URL
	})
	await pgClient.connect()
	return pgClient
}

async function getChunks(pgClient: pg.Client, cursor: number, limit: number) {
	const chunk = await pgClient.query<BookLite>(`
SELECT
	a.id,
	a.image
FROM
	wenqu_book AS a
	LEFT JOIN image_infos AS b ON a.id = b.book_image_info
WHERE
	a.id < $1
	AND b.id IS NULL
ORDER BY
	a.id DESC
LIMIT $2
`, [cursor, limit])
	return chunk.rows
}

function saveImageInfo(imageInfos: Omit<image_infos, 'id'>[]) {
	return prisma.image_infos.createMany({
		data: imageInfos
	})
}

function fetchImage(urlPath: string) {
	let reqUrl = urlPath
	if (!reqUrl.startsWith('http')) {
		reqUrl = `${CDN_HOST}/${reqUrl}`
	}

	logger.info('request url: ' + reqUrl)

	return fetch(reqUrl)
}

async function main() {
	const pgClient = await ensurePG()

	// sql select rows that do not exist in image info table
	let nextChunkSize = CHUNK_SIZE
	let lastId = 1<<29
	while (true) {
		logger.info('will going to next: ' + lastId)
		const chunks = await getChunks(pgClient, lastId, nextChunkSize)
		if (chunks.length === 0) {
			break
		}

		let imageInfoList: Omit<image_infos, 'id'>[] = []

		for (let chunk of chunks) {
			const img = await fetchImage(chunk.image).then(res => res.blob()).then(res=>res.arrayBuffer())
			const imgUint8 = new Uint8Array(img)
			const { data, info } = await sharp(imgUint8).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
			const buf = Uint8ClampedArray.from(data)
			try {
				const blurResult = encode(buf, info.width ?? 100, info.height ?? 100, 1, 1)
				imageInfoList.push({
					book_image_info: BigInt(chunk.id),
					height: BigInt(info.height),
					width: BigInt(info.width),
					ratio: info.width / info.height,
					blur_hash_value: blurResult,
				})
			} catch (e) {
				logger.error(e)

			}
		}
		await saveImageInfo(imageInfoList)
		imageInfoList = []
		nextChunkSize = chunks.length
		lastId = chunks[chunks.length - 1].id
	}

	await pgClient.end()
	logger.info('done')
}

main().then(() => {
	process.exit(0)
}).catch(err => {
	console.error(err)
})