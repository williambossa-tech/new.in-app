export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
};
export const initialState: ActionState = {};
