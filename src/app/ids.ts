/** Random ids for records created in the browser. Domain code never calls this; ids are passed in. */
export function newId(): string {
  return crypto.randomUUID();
}
