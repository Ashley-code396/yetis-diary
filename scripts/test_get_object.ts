import { createYetisDiaryClient } from '../sdk/src/yetisDiary.js';
import { bcs } from '@mysten/sui/bcs';

const TableBcs = bcs.struct('Table', {
  id: bcs.Address,
  size: bcs.u64(),
});

const DiaryBcs = bcs.struct('Diary', {
  id: bcs.Address,
  entry_count: bcs.u64(),
  last_writer: bcs.Address,
  last_written_at: bcs.u64(),
  current_blob_id: bcs.string(),
  content_hash: bcs.vector(bcs.u8()),
  queue: bcs.vector(bcs.Address),
  turn_index: bcs.u64(),
  registered: TableBcs,
  last_written_at_by_wallet: TableBcs,
});

async function main() {
  const client = createYetisDiaryClient({
    network: 'testnet',
  });
  
  const diaryId = '0xb2243ea8a350d4f8bd0e72c1798db59d8b4d9cb00ce33521542be93c4d0ae3bc';
  
  console.log('Querying object:', diaryId);
  try {
    const response = await client.core.getObject({
      objectId: diaryId,
      include: { content: true },
    });
    
    const contentObj = response.object?.content;
    if (!contentObj) {
      throw new Error('No content found in object response');
    }
    
    // contentObj is an object with numeric keys, e.g. { "0": 178, "1": 36, ... }
    // Convert it to a Uint8Array
    const keys = Object.keys(contentObj).map(Number).sort((a, b) => a - b);
    const bytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      bytes[i] = (contentObj as any)[keys[i]];
    }
    
    console.log('Byte length:', bytes.length);
    
    const parsed = DiaryBcs.parse(bytes);
    console.log('Parsed Diary Object successfully:');
    console.log(JSON.stringify(parsed, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
