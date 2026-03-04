import Dexie, { type Table } from 'dexie';
import type { RowRecord, SeriesMeta } from '../types';

export class XlsDataDb extends Dexie {
  series!: Table<SeriesMeta, string>;
  rows!: Table<RowRecord, [string, string]>;

  constructor() {
    super('XlsDataViewDB');

    this.version(1).stores({
      series: '&series, updatedAt',
      rows: '[series+rowKey], series, rowKey'
    });
  }
}

export const db = new XlsDataDb();
