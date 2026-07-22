import {
    assertUnreachable,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';

export const getCredentialsWithPlaceholders = (
    credentials: UserWarehouseCredentials['credentials'],
): UpsertUserWarehouseCredentials['credentials'] => {
    switch (credentials.type) {
        case WarehouseTypes.REDSHIFT:
            return {
                ...credentials,
                password: '',
                accessKeyId: '',
                secretAccessKey: '',
                sessionToken: '',
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.BIGQUERY:
            return {
                ...credentials,
                keyfileContents: {},
            };
        case WarehouseTypes.DATABRICKS:
            return {
                ...credentials,
                personalAccessToken: '',
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.ATHENA:
            return {
                ...credentials,
                accessKeyId: '',
                secretAccessKey: '',
            };
        case WarehouseTypes.DUCKDB:
            return {
                ...credentials,
                token: '',
            };
        default:
            return assertUnreachable(
                credentials,
                'Credential type not supported',
            );
    }
};
