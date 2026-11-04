// QA/CLI helper: same generated manifest as the Preview, no market requests.
import {buildPreview} from './build-preview.mjs';
const worker=await import('data:text/javascript;base64,'+Buffer.from(buildPreview({format:'module'})).toString('base64'));
console.log(await (await worker.default.fetch(new Request('https://preview.test/lab/build.json'))).text());
