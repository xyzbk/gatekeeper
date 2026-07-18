import { writeFile } from 'node:fs/promises';

import { reviewRunJsonSchema } from '../src/review.js';

const outputUrl = new URL('../../../schemas/verdict.schema.json', import.meta.url);

await writeFile(outputUrl, `${JSON.stringify(reviewRunJsonSchema, null, 2)}\n`, 'utf8');
