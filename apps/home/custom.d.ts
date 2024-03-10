type Constructor<T = {}> = new (...args: any[]) => T;

declare module "*.png" {
  const content: any;
  export default content;
}

declare module "*.json" {
  const value: any;
  export default value;
}
