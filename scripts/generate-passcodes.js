// Run this script to generate 100 passcodes
// Usage: node scripts/generate-passcodes.js

// Generate a random passcode (8 characters, uppercase letters and numbers)
function generatePasscode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 0, O, 1, I
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate 100 unique passcodes
const passcodes = new Set();
while (passcodes.size < 100) {
  passcodes.add(generatePasscode());
}

console.log("=== 100 UNIQUE PASSCODES ===\n");
console.log("Copy these and save them somewhere safe.\n");
console.log("Each passcode can only be used ONCE to create an account.\n");
console.log("----------------------------\n");

const codeArray = Array.from(passcodes);
for (let i = 0; i < codeArray.length; i++) {
  console.log(`${(i + 1).toString().padStart(3, ' ')}. ${codeArray[i]}`);
}

console.log("\n----------------------------");
console.log(`\nTotal: ${codeArray.length} passcodes`);

// Also output as JSON for easy import
console.log("\n\n=== JSON FORMAT (for database import) ===\n");
console.log(JSON.stringify(codeArray, null, 2));
