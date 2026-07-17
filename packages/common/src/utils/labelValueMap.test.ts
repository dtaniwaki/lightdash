import { type ResultRow } from '../types/results';
import { buildLabelValueMap, getLabelForValue } from './labelValueMap';

const row = (cells: Record<string, unknown>): ResultRow =>
    Object.fromEntries(
        Object.entries(cells).map(([key, raw]) => [
            key,
            { value: { raw, formatted: String(raw) } },
        ]),
    );

describe('buildLabelValueMap', () => {
    it('returns an empty map when there is no labelDimensionMap', () => {
        expect(buildLabelValueMap([], undefined)).toEqual({});
        expect(buildLabelValueMap([], {})).toEqual({});
    });

    it('maps each raw id to its label from the companion column', () => {
        const rows = [
            row({ orders_customer_id: 1, customers_name: 'Alice' }),
            row({ orders_customer_id: 2, customers_name: 'Bob' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '1': 'Alice', '2': 'Bob' },
        });
    });

    it('keeps the first label when a raw id maps to several labels', () => {
        const rows = [
            row({ orders_customer_id: 1, customers_name: 'Alice' }),
            row({ orders_customer_id: 1, customers_name: 'Alice (dupe)' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '1': 'Alice' },
        });
    });

    it('skips rows whose id value is null or undefined', () => {
        const rows = [
            row({ orders_customer_id: null, customers_name: 'Nobody' }),
            row({ orders_customer_id: 3, customers_name: 'Carol' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '3': 'Carol' },
        });
    });
});

describe('getLabelForValue', () => {
    const labelValueMap = {
        orders_customer_id: { '1': 'Alice' },
    };

    it('returns the label for a known field and value', () => {
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', 1),
        ).toEqual('Alice');
    });

    it('returns undefined for unknown field, value, or nullish input', () => {
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', 9),
        ).toBeUndefined();
        expect(getLabelForValue(labelValueMap, 'other', 1)).toBeUndefined();
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', null),
        ).toBeUndefined();
        expect(
            getLabelForValue(undefined, 'orders_customer_id', 1),
        ).toBeUndefined();
    });
});
