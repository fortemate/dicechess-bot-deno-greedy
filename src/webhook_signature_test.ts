import { assertEquals } from '@std/assert';
import { handleDelivery, sign, verifySignature } from './webhook.ts';

const FIXTURE_KEY = 'authored-non-secret-fixture';
const TIMESTAMP = 1_700_000_000;
const BODY = '{"type":"turn","dfen":"authored-fixture"}';
// Independently calculated HMAC-SHA256 vectors, not produced by the implementation under test.
const DIGEST = '044a70901b70e39b54b01a2bef8e299da6ac1f6a0ce1bd755f5fe16ebf620717';

Deno.test('sign matches the independent HMAC-SHA256 vector', async () => {
  assertEquals(await sign(FIXTURE_KEY, TIMESTAMP, BODY), DIGEST);
});

Deno.test('verification preserves the inclusive replay boundary and numeric timestamp parsing', async () => {
  const cases = [
    [TIMESTAMP, String(TIMESTAMP)],
    [TIMESTAMP + 300, String(TIMESTAMP)],
    [TIMESTAMP - 300, String(TIMESTAMP)],
    [TIMESTAMP, ' 1700000000.0 '],
  ] as const;
  await Promise.all(cases.map(async ([now, timestamp]) => {
    assertEquals(await verifySignature(FIXTURE_KEY, timestamp, BODY, DIGEST, now), true);
  }));
});

Deno.test('every changed ASCII position and surrogate signature is rejected', async () => {
  const cases: { signature: string; position: number }[] = [];
  for (let i = 0; i < DIGEST.length; i++) {
    const rejected = [
      DIGEST.slice(0, i) + (DIGEST[i] === '0' ? '1' : '0') + DIGEST.slice(i + 1),
      DIGEST.slice(0, i) + '\ud800' + DIGEST.slice(i + 1),
      DIGEST.slice(0, i) + '\udfff' + DIGEST.slice(i + 1),
    ];
    if (i + 1 < DIGEST.length) {
      rejected.push(DIGEST.slice(0, i) + '😀' + DIGEST.slice(i + 2));
    }
    for (const signature of rejected) cases.push({ signature, position: i });
  }
  assertEquals(cases.length, 255);
  await Promise.all(cases.map(async ({ signature, position }) => {
    assertEquals(
      await verifySignature(FIXTURE_KEY, String(TIMESTAMP), BODY, signature, TIMESTAMP),
      false,
      `changed signature at UTF-16 position ${position}`,
    );
  }));
});

Deno.test('signature shape, case, whitespace and length remain strict', async () => {
  const cases = [
    undefined,
    '',
    'sha256=' + DIGEST,
    ' ' + DIGEST,
    DIGEST + ' ',
    DIGEST.toUpperCase(),
    DIGEST.slice(1),
    DIGEST + '0',
  ];
  await Promise.all(cases.map(async (signature) => {
    assertEquals(
      await verifySignature(FIXTURE_KEY, String(TIMESTAMP), BODY, signature, TIMESTAMP),
      false,
    );
  }));
});

Deno.test('missing, nonfinite and out-of-window timestamps are rejected', async () => {
  const cases = [
    [TIMESTAMP, undefined],
    [TIMESTAMP, 'Infinity'],
    [TIMESTAMP + 301, String(TIMESTAMP)],
    [TIMESTAMP - 301, String(TIMESTAMP)],
  ] as const;
  await Promise.all(cases.map(async ([now, timestamp]) => {
    assertEquals(await verifySignature(FIXTURE_KEY, timestamp, BODY, DIGEST, now), false);
  }));
});

Deno.test('delivery rejects a same-length Unicode signature before calling the strategy', async () => {
  let calls = 0;
  const choose = () => {
    calls++;
    return [];
  };
  const rejected = await handleDelivery(
    {
      'x-dicechess-timestamp': String(TIMESTAMP),
      'x-dicechess-signature': DIGEST.slice(0, 31) + '😀' + DIGEST.slice(33),
    },
    BODY,
    FIXTURE_KEY,
    choose,
    TIMESTAMP,
  );
  assertEquals(rejected, { status: 401, body: { error: 'invalid or expired signature' } });
  assertEquals(calls, 0);
  const accepted = await handleDelivery(
    { 'x-dicechess-timestamp': String(TIMESTAMP), 'x-dicechess-signature': DIGEST },
    BODY,
    FIXTURE_KEY,
    choose,
    TIMESTAMP,
  );
  assertEquals(accepted, { status: 200, body: { moves: [] } });
  assertEquals(calls, 1);
});

Deno.test('signatures bind exact UTF-8 body content', async () => {
  const body = '{"type":"turn","dfen":"fixture🦄"}';
  const digest = '8431d77388a68ae6e68c19c5ae4d3fe0f7422f16b2fe35b21c6b2a830f26fb09';
  assertEquals(await sign(FIXTURE_KEY, TIMESTAMP, body), digest);
  assertEquals(
    await verifySignature(FIXTURE_KEY, String(TIMESTAMP), body, digest, TIMESTAMP),
    true,
  );
  assertEquals(
    await verifySignature(FIXTURE_KEY, String(TIMESTAMP), body.replace('🦄', '🐴'), digest, TIMESTAMP),
    false,
  );
});

Deno.test('malformed JSON and envelopes without a string type retain their error responses', async () => {
  const cases = [
    ['{', 'malformed JSON'],
    ['null', 'missing "type"'],
    ['{}', 'missing "type"'],
    ['{"type":1}', 'missing "type"'],
  ];
  await Promise.all(cases.map(async ([body, error]) => {
    assertEquals(await handleDelivery({}, body, FIXTURE_KEY, () => [], TIMESTAMP), {
      status: 400,
      body: { error },
    });
  }));
});

Deno.test('unknown delivery types are rejected before signature verification', async () => {
  assertEquals(
    await handleDelivery({}, '{"type":"other"}', FIXTURE_KEY, () => [], TIMESTAMP),
    { status: 400, body: { error: 'unrecognized "type": other' } },
  );
});

Deno.test('a signed turn without a position retains the missing-dfen response', async () => {
  const body = '{"type":"turn"}';
  assertEquals(
    await handleDelivery(
      {
        'x-dicechess-timestamp': String(TIMESTAMP),
        'x-dicechess-signature': await sign(FIXTURE_KEY, TIMESTAMP, body),
      },
      body,
      FIXTURE_KEY,
      () => [],
      TIMESTAMP,
    ),
    { status: 400, body: { error: 'missing dfen' } },
  );
});

Deno.test('yourTurn accepts a nested position and awaits the strategy', async () => {
  const body = '{"type":"yourTurn","state":{"dfen":"nested-fixture"}}';
  const seen: string[] = [];
  assertEquals(
    await handleDelivery(
      {
        'x-dicechess-timestamp': String(TIMESTAMP),
        'x-dicechess-signature': await sign(FIXTURE_KEY, TIMESTAMP, body),
      },
      body,
      FIXTURE_KEY,
      (dfen) => {
        seen.push(dfen);
        return Promise.resolve(['a2a3']);
      },
      TIMESTAMP,
    ),
    { status: 200, body: { moves: ['a2a3'] } },
  );
  assertEquals(seen, ['nested-fixture']);
});

Deno.test('strategy errors retain the delivery error response', async () => {
  assertEquals(
    await handleDelivery(
      { 'x-dicechess-timestamp': String(TIMESTAMP), 'x-dicechess-signature': DIGEST },
      BODY,
      FIXTURE_KEY,
      () => {
        throw new Error('authored strategy failure');
      },
      TIMESTAMP,
    ),
    { status: 500, body: { error: 'strategy failed: authored strategy failure' } },
  );
});

Deno.test('verification without a nonce echoes the existing empty-string fallback', async () => {
  assertEquals(
    await handleDelivery({}, '{"type":"verification"}', FIXTURE_KEY, () => [], TIMESTAMP),
    { status: 200, body: { nonce: '' } },
  );
});
