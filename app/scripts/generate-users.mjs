import { randomBytes } from "node:crypto";

const users = [
  ["aaron", "Aarón Mayorga", "Administrador"],
  ["luis_ma", "Luis Martínez", "Editor"],
  ["daniel", "Daniel Pulido", "Editor"],
  ["luis_m", "Luis Montero", "Editor"],
  ["karol", "Karol", "Editor"],
  ["jorge", "Jorge Jiménez", "Editor"],
  ["kenneth", "Kenneth", "Editor"],
];

const credentials = users.map(([id, name, role]) => ({
  id,
  name,
  role,
  token: randomBytes(32).toString("base64url"),
  active: true,
}));

console.log("\nFARO_USERS_JSON (pegalo completo como variable Sensitive en Vercel):\n");
console.log(JSON.stringify(credentials));
console.log("\nFARO_SESSION_SECRET (pegalo como otra variable Sensitive):\n");
console.log(randomBytes(32).toString("base64url"));
console.log("\nClaves personales (compartilas individualmente por un canal privado):\n");
for (const user of credentials) console.log(`${user.name}: ${user.token}`);
console.log("\nSi volvés a ejecutar este comando generarás claves y secreto nuevos; actualizá Vercel y redistribuí las claves.\n");
