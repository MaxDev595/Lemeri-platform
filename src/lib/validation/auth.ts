import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(80),
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(10, "Минимум 10 символов").max(128),
  company: z.string().trim().min(2, "Укажите компанию").max(120),
});

export const loginSchema = registerSchema.pick({ email: true, password: true });
