import type { SourceConfig, TextDiffResult } from '../../../shared/types'
import { formatFileReadErrorForUi, isTransientFileReadError } from './file-read-error'

const TRANSIENT_READ_RETRY_COUNT = 1

interface LoadDiffTabContentsInput {
  readonly leftSource: SourceConfig | null
  readonly rightSource: SourceConfig | null
  readonly leftFullPath: string
  readonly rightFullPath: string
  readonly readLeft: boolean
  readonly readRight: boolean
}

export interface DiffTabLoadResult {
  readonly leftContent: string
  readonly rightContent: string
  readonly diffResult: TextDiffResult | null
  readonly loadError: string | null
}

async function readTextWithRetry(
  sideLabel: string,
  source: SourceConfig | null,
  filePath: string,
  shouldRead: boolean,
): Promise<{ content: string; error: string | null }> {
  if (!shouldRead || !source) {
    return { content: '', error: null }
  }

  let lastError: string | undefined

  for (let attempt = 0; attempt <= TRANSIENT_READ_RETRY_COUNT; attempt += 1) {
    const response = await window.api.readText(source, filePath)
    if (response.success && response.data != null) {
      return { content: response.data, error: null }
    }

    lastError = response.error
    if (attempt >= TRANSIENT_READ_RETRY_COUNT || !isTransientFileReadError(response.error)) {
      break
    }
  }

  return {
    content: '',
    error: formatFileReadErrorForUi(sideLabel, source, filePath, lastError),
  }
}

export async function loadDiffTabContents(input: LoadDiffTabContentsInput): Promise<DiffTabLoadResult> {
  const loadErrors: string[] = []

  const [leftResult, rightResult] = await Promise.all([
    readTextWithRetry('左侧', input.leftSource, input.leftFullPath, input.readLeft),
    readTextWithRetry('右侧', input.rightSource, input.rightFullPath, input.readRight),
  ])

  if (leftResult.error) {
    loadErrors.push(leftResult.error)
  }

  if (rightResult.error) {
    loadErrors.push(rightResult.error)
  }

  const leftContent = leftResult.content
  const rightContent = rightResult.content

  if (loadErrors.length > 0) {
    return {
      leftContent,
      rightContent,
      diffResult: null,
      loadError: loadErrors.join('\n'),
    }
  }

  const diffResponse = await window.api.textDiff(leftContent, rightContent)
  if (!diffResponse.success || !diffResponse.data) {
    return {
      leftContent,
      rightContent,
      diffResult: null,
      loadError: diffResponse.error?.trim() || '文本差异计算失败',
    }
  }

  return {
    leftContent,
    rightContent,
    diffResult: diffResponse.data,
    loadError: null,
  }
}