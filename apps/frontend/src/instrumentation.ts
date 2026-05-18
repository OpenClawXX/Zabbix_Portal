export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { config } = await import("dotenv");
    config();
  }
};
