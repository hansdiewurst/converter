/**
 * Read and write schematics of one format
 */
export interface SchematicHandler<TSchematicData> {
    /**
     * Convert raw buffer data to JSON
     * @param buffer The raw data
     * @returns JSON data
     */
    parseBuffer(buffer: Buffer): Promise<TSchematicData>;
    /**
     * Write parsed JSON to raw data
     * @param data JSON data
     * @returns Raw buffer data
     */
    writeBuffer(data: TSchematicData): Buffer;
}