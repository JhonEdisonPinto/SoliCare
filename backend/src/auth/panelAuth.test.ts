import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPanelAuth } from './panelAuth.js';

describe('createPanelAuth', () => {
  test('PANEL_TOKEN is the key when set', () => {
    const auth = createPanelAuth({ panelToken: 'panel-key' });
    assert.equal(auth('Bearer panel-key'), true);
  });

  test('rejects missing, malformed and wrong keys, including a prefix or a longer key', () => {
    const auth = createPanelAuth({ panelToken: 'panel-key' });
    for (const header of [undefined, '', 'panel-key', 'Basic panel-key', 'Bearer ', 'Bearer wrong', 'Bearer panel-ke', 'Bearer panel-key-extra']) {
      assert.equal(auth(header), false, String(header));
    }
  });

  test('while PANEL_TOKEN is unset or empty the panel is open, with or without a header', () => {
    for (const panelToken of [undefined, '']) {
      const auth = createPanelAuth({ panelToken });
      assert.equal(auth(undefined), true);
      assert.equal(auth('Bearer anything'), true);
    }
  });
});
