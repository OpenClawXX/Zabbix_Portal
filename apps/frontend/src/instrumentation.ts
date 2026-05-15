export const register = async () => {
  const { config } = await import("dotenv");
  config();
};
