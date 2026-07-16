import { test, expect } from '@grafana/plugin-e2e';

import { type InfluxOptions } from '../../src/types';

// Fixture data window — see tests/fixtures/README.md. Literal timestamps keep
// the queries independent of the dashboard time range the annotation page
// opens with.
const FIXTURE_FROM_ISO = '2026-06-01T00:00:00Z';
const FIXTURE_TO_ISO = '2026-06-01T04:00:00Z';

test.describe('Annotation editor: SQL', () => {
  test('renders the SQL query editor instead of the InfluxQL editor', async ({
    annotationEditPage,
    readProvisionedDataSource,
    page,
  }) => {
    const ds = await readProvisionedDataSource<InfluxOptions>({
      fileName: 'datasources.yml',
      name: 'InfluxDB v3 (SQL)',
    });
    await annotationEditPage.datasource.set(ds.name);

    await expect(page.getByRole('radio', { name: 'Builder' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SQL language syntax' })).toBeVisible();
    await expect(page.getByText('InfluxQL Query')).toBeHidden();
  });

  test('runs an annotation query and maps events from fixture data', async ({
    annotationEditPage,
    readProvisionedDataSource,
    page,
  }) => {
    const ds = await readProvisionedDataSource<InfluxOptions>({
      fileName: 'datasources.yml',
      name: 'InfluxDB v3 (SQL)',
    });
    await annotationEditPage.datasource.set(ds.name);

    await page.getByRole('radio', { name: 'Code' }).click({ force: true });
    await expect(page.getByRole('radio', { name: 'Code' })).toBeChecked();

    const query =
      'SELECT time, path AS text, method AS tags FROM httplogs ' +
      `WHERE "statusCode" >= 500 AND time >= timestamp '${FIXTURE_FROM_ISO}' AND time <= timestamp '${FIXTURE_TO_ISO}' ` +
      'ORDER BY time';
    const editor = page.getByRole('textbox', { name: /editor content/i });
    await editor.click();
    // Set the Monaco model directly: simulated keystrokes race against the
    // annotation state round-trip, which resets the editor content mid-typing.
    await page.evaluate((rawSql) => {
      type MonacoGlobal = { editor: { getModels(): Array<{ setValue(value: string): void }> } };
      const { monaco } = window as Window & { monaco?: MonacoGlobal };
      monaco?.editor.getModels()[0].setValue(rawSql);
    }, query);
    // Blur fires a final synchronous onChange with the full editor content.
    await editor.blur();
    await expect(editor).toHaveValue(query);

    await expect(annotationEditPage.runQuery()).toBeOK();
    // The fixture dataset contains exactly 8 httplogs rows with a 5xx status.
    await expect(page.getByText('8 events (from 3 fields)')).toBeVisible();
  });
});

test.describe('Annotation editor: InfluxQL', () => {
  test('renders the InfluxQL annotation editor and runs a query', async ({
    annotationEditPage,
    readProvisionedDataSource,
    page,
  }) => {
    const ds = await readProvisionedDataSource<InfluxOptions>({
      fileName: 'datasources.yml',
      name: 'InfluxDB v1 (InfluxQL)',
    });
    await annotationEditPage.datasource.set(ds.name);

    await expect(page.getByText('InfluxQL Query')).toBeVisible();

    // The InfluxQL annotation editor only propagates the query on blur.
    const queryInput = page.getByPlaceholder('select text from events where $timeFilter limit 1000');
    // statusCode is a field — InfluxQL returns nothing when only tags are selected.
    await queryInput.fill(
      `SELECT "statusCode" FROM httplogs WHERE time >= '${FIXTURE_FROM_ISO}' AND time <= '${FIXTURE_TO_ISO}'`
    );
    await queryInput.blur();

    await expect(annotationEditPage.runQuery()).toBeOK();
    // One event per fixture row: 240 ticks in the httplogs measurement.
    await expect(page.getByText(/240 events/)).toBeVisible();
  });
});
