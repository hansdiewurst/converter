export type TypedObject<T> = {
    [key: string]: T
};
export type GenericObject = TypedObject<any>;