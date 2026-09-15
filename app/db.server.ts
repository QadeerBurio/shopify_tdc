// This file just opens one shared connection to your database
// so the rest of the app doesn't have to reconnect every time.
import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

export default prisma;
