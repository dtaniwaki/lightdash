import { type ResultRow } from '../types/results';

export type LabelValueMap = Record<string, Record<string, string>>;

export const buildLabelValueMap = (
    rows: ResultRow[],
    labelDimensionMap: Record<string, string> | undefined,
): LabelValueMap => {
    if (!labelDimensionMap || Object.keys(labelDimensionMap).length === 0) {
        return {};
    }
    const result: LabelValueMap = {};
    for (const [idFieldId, labelFieldId] of Object.entries(labelDimensionMap)) {
        const byRawValue: Record<string, string> = {};
        for (const row of rows) {
            const rawValue = row[idFieldId]?.value?.raw;
            if (rawValue !== undefined && rawValue !== null) {
                const rawKey = String(rawValue);
                const label = row[labelFieldId]?.value?.formatted;
                if (byRawValue[rawKey] === undefined && label !== undefined) {
                    byRawValue[rawKey] = label;
                }
            }
        }
        result[idFieldId] = byRawValue;
    }
    return result;
};

export const getLabelForValue = (
    labelValueMap: LabelValueMap | undefined,
    fieldId: string,
    value: unknown,
): string | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    return labelValueMap?.[fieldId]?.[String(value)];
};
