import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPanelAuth } from './panelAuth.js';

describe('createPanelAuth', () => {
  test('PANEL_TOKEN is the key when set, and the device token no longer works', () => {
    const auth = createPanelAuth({ panelToken: 'panel-key', deviceIngestToken: 'device-key', nodeEnv: 'production' });
    assert.equal(auth('Bearer panel-key'), true);
    assert.equal(auth('Bearer device-key'), false);
  });

  test('falls back to DEVICE_INGEST_TOKEN while PANEL_TOKEN is unset or empty', () => {
    for (const panelToken of [undefined, '']) {
      const auth = createPanelAuth({ panelToken, deviceIngestToken: 'device-key', nodeEnv: 'production' });
      assert.equal(auth('Bearer device-key'), true);
    }
  });

  test('rejects missing, malformed and wrong keys, including a prefix or a longer key', () => {
    const auth = createPanelAuth({ panelToken: 'panel-key', nodeEnv: 'production' });
    for (const header of [undefined, '', 'panel-key', 'Basic panel-key', 'Bearer ', 'Bearer wrong', 'Bearer panel-ke', 'Bearer panel-key-extra']) {
      assert.equal(auth(header), false, String(header));
    }
  });

  test('with no token at all, development allows and production refuses', () => {
    assert.equal(createPanelAuth({ nodeEnv: 'development' })(undefined), true);
    assert.equal(createPanelAuth({ nodeEnv: 'production' })(undefined), false);
    assert.equal(createPanelAuth({ nodeEnv: 'production' })('Bearer anything'), false);
  });
});
