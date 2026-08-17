function normalize(value: string) {
  return value.trim();
}

export function getRegisterValidationError({
  name,
  email,
  password,
  confirmPassword,
}: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): { title: string; message: string } | null {
  const normalizedName = normalize(name);
  const normalizedEmail = normalize(email).toLowerCase();
  if (!normalizedName) return { title: "Missing name", message: "Enter your first name." };
  if (!normalizedEmail) return { title: "Missing email", message: "Enter your email." };
  if (!password) return { title: "Missing password", message: "Enter a password." };
  if (password.length < 8) {
    return { title: "Weak password", message: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { title: "Password mismatch", message: "Passwords do not match." };
  }
  return null;
}
