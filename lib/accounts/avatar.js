const { randomUUID, createHash } = require("node:crypto");
const sharp = require("sharp");
const {
  writeEmployeeFile,
  deleteEmployeeFile,
} = require("../employee-file-storage");
const { validateFileContent } = require("../operations/employee-uploads");
const {
  changeConfig,
  assertCan,
  failure,
  publicAccount,
  readConfig,
  assertOperationsAccount,
  assertAccountScope,
} = require("./service");
async function imageBytes(file) {
  if (
    !file ||
    typeof file.arrayBuffer !== "function" ||
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw failure("Use a JPG, PNG or WebP image up to 5 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    validateFileContent(buffer, file.type);
  } catch (error) {
    throw failure(error.message);
  }
  try {
    return await sharp(buffer, { limitInputPixels: 16000000, animated: false })
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw failure("Invalid or oversized image");
  }
}
async function setAvatar(db, actor, id, file) {
  const { config: initial } = await readConfig(db);
  if (id !== actor.id) {
    assertCan(actor, "users.edit");
    assertOperationsAccount(initial, id);
    assertAccountScope(
      actor,
      publicAccount(await db.user.findUnique({ where: { id } }), initial),
      "users.edit",
    );
  }
  if (!initial.accounts[id]) throw failure("Account not found", 404);
  let avatar = null;
  if (file) {
    const bytes = await imageBytes(file);
    avatar = {
      storageKey: `accounts/${id}/${randomUUID()}.webp`,
      mimeType: "image/webp",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      version: randomUUID(),
    };
    await writeEmployeeFile(avatar.storageKey, bytes, avatar.mimeType);
  }
  let old;
  try {
    const result = await changeConfig(
      db,
      actor,
      file ? "ACCOUNT_AVATAR_UPDATED" : "ACCOUNT_AVATAR_REMOVED",
      id,
      async (tx, config, fresh) => {
        if (id !== actor.id) {
          assertCan(fresh, "users.edit");
          assertOperationsAccount(config, id);
          assertAccountScope(
            fresh,
            publicAccount(await tx.user.findUnique({ where: { id } }), config),
            "users.edit",
          );
          const target = config.accounts[id];
          if (
            !fresh.profile.allBranches &&
            (target?.allBranches ||
              target?.branches.some((b) => !fresh.profile.branches.includes(b)))
          )
            throw failure("Account is outside your scope", 403);
        }
        if (!config.accounts[id]) throw failure("Account not found", 404);
        old = config.accounts[id].avatar;
        config.accounts[id].avatar = avatar;
        return publicAccount(
          await tx.user.findUnique({
            where: { id },
            include: { employee: true },
          }),
          config,
        );
      },
    );
    if (old) await deleteEmployeeFile(old.storageKey).catch(() => {});
    return result;
  } catch (error) {
    if (avatar) await deleteEmployeeFile(avatar.storageKey).catch(() => {});
    throw error;
  }
}
module.exports = { imageBytes, setAvatar };
