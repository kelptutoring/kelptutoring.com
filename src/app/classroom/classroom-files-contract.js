const FILE_STATUSES = new Set(['reserved', 'active', 'hidden'])
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const EXTENSIONS_BY_MIME_TYPE = Object.freeze({
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png']
})

export function validateClassroomUpload(file, uploadRules = {}) {
  const name = String(file?.name || '').trim()
  const mimeType = String(file?.type || '').trim().toLowerCase()
  const size = Number(file?.size)
  const maxFileSizeBytes = normalizePositiveInteger(
    uploadRules?.maxFileSizeBytes,
    20 * 1024 * 1024
  )
  const allowedMimeTypes = new Set(
    (Array.isArray(uploadRules?.allowedMimeTypes)
      ? uploadRules.allowedMimeTypes
      : [...ALLOWED_MIME_TYPES])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => ALLOWED_MIME_TYPES.has(value))
  )

  if (!name || name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    return invalidUpload('Choose a file with a valid name of up to 255 characters.')
  }
  if (!allowedMimeTypes.has(mimeType)) {
    return invalidUpload('Only PDF, JPEG, and PNG files are supported.')
  }
  if (!Number.isInteger(size) || size < 1) {
    return invalidUpload('The selected file is empty or unreadable.')
  }
  if (size > maxFileSizeBytes) {
    return invalidUpload(`This file is larger than ${formatFileSize(maxFileSizeBytes)}.`)
  }
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (!EXTENSIONS_BY_MIME_TYPE[mimeType]?.includes(extension)) {
    return invalidUpload('The file extension does not match its file type.')
  }
  return Object.freeze({ valid: true, message: '', name, mimeType, size })
}

export function normalizeClassroomFilesPayload(payload = {}) {
  const classroomId = String(payload?.classroomId || '').trim()
  if (!classroomId) throw new TypeError('The Classroom Files payload is incomplete.')

  const allowedMimeTypes = (Array.isArray(payload?.uploadRules?.allowedMimeTypes)
    ? payload.uploadRules.allowedMimeTypes
    : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => ALLOWED_MIME_TYPES.has(value))

  return Object.freeze({
    schemaVersion: Math.max(1, Number(payload?.schemaVersion) || 1),
    classroomId,
    access: Object.freeze({
      canUpload: Boolean(payload?.access?.canUpload),
      canModerate: Boolean(payload?.access?.canModerate),
      canPermanentlyPurge: false
    }),
    uploadRules: Object.freeze({
      bucket: String(payload?.uploadRules?.bucket || 'classroom-files'),
      maxFileSizeBytes: normalizePositiveInteger(payload?.uploadRules?.maxFileSizeBytes, 20 * 1024 * 1024),
      allowedMimeTypes: Object.freeze(allowedMimeTypes),
      uploaderWithdrawalMinutes: normalizePositiveInteger(payload?.uploadRules?.uploaderWithdrawalMinutes, 120),
      reservationMinutes: normalizePositiveInteger(payload?.uploadRules?.reservationMinutes, 30)
    }),
    retentionPolicy: String(payload?.retentionPolicy || 'provisional_two_year_classroom_retention'),
    files: Object.freeze((Array.isArray(payload?.files) ? payload.files : [])
      .map(normalizeClassroomFile)
      .filter(Boolean)),
    featureStatus: Object.freeze({
      fileAuthority: String(payload?.featureStatus?.fileAuthority || 'planned').trim().toLowerCase(),
      fileInterface: String(payload?.featureStatus?.fileInterface || 'planned').trim().toLowerCase()
    })
  })
}

function normalizeClassroomFile(file) {
  const id = String(file?.id || '').trim()
  const name = String(file?.name || '').trim()
  const mimeType = String(file?.mimeType || '').trim().toLowerCase()
  const status = String(file?.status || '').trim().toLowerCase()
  const storageBucket = String(file?.storage?.bucket || '').trim()
  const storagePath = String(file?.storage?.path || '').trim()
  if (!id || !name || !ALLOWED_MIME_TYPES.has(mimeType)
    || !FILE_STATUSES.has(status) || !storageBucket || !storagePath) return null

  return Object.freeze({
    id,
    name,
    mimeType,
    sizeBytes: normalizePositiveInteger(file?.sizeBytes, 0),
    status,
    uploadedAt: file?.uploadedAt || null,
    uploadedBy: Object.freeze({
      id: String(file?.uploadedBy?.id || ''),
      name: String(file?.uploadedBy?.name || 'Classroom member')
    }),
    storage: Object.freeze({ bucket: storageBucket, path: storagePath }),
    canWithdraw: Boolean(file?.canWithdraw),
    withdrawalDeadline: file?.withdrawalDeadline || null,
    canHide: Boolean(file?.canHide),
    hiddenReason: file?.hiddenReason || null
  })
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function invalidUpload(message) {
  return Object.freeze({ valid: false, message, name: '', mimeType: '', size: 0 })
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  const megabytes = bytes / (1024 * 1024)
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}
