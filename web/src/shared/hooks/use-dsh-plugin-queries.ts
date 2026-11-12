import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteDshPluginVersion,
  getDshPlugin,
  listDshPluginCategories,
  listDshPlugins,
  listMyDshPlugins,
  previewDshPluginPackage,
  publishDshPlugin,
  recommendDshPluginVersion,
  setDshPluginHidden,
  unyankDshPluginVersion,
  updateDshPlugin,
  yankDshPluginVersion,
  type DshPluginMetadataInput,
  type DshPluginPublishInput,
  type DshPluginQuery,
} from '@/api/dsh-plugins'
import { getI18nCacheKey } from './query-keys'

const pluginKeys = {
  all: ['dsh-plugins'] as const,
  catalog: (query: DshPluginQuery) => ['dsh-plugins', 'catalog', query, getI18nCacheKey()] as const,
  categories: () => ['dsh-plugins', 'categories', getI18nCacheKey()] as const,
  detail: (namespace: string, slug: string) =>
    ['dsh-plugins', 'detail', namespace, slug, getI18nCacheKey()] as const,
  mine: (page: number, q: string) => ['dsh-plugins', 'mine', page, q, getI18nCacheKey()] as const,
}

export function useDshPlugins(query: DshPluginQuery) {
  return useQuery({
    queryKey: pluginKeys.catalog(query),
    queryFn: ({ signal }) => listDshPlugins(query, signal),
    placeholderData: keepPreviousData,
  })
}

export function useDshPluginCategories() {
  return useQuery({
    queryKey: pluginKeys.categories(),
    queryFn: ({ signal }) => listDshPluginCategories(signal),
    staleTime: 60_000,
  })
}

export function useDshPluginDetail(namespace: string, slug: string, enabled = true) {
  return useQuery({
    queryKey: pluginKeys.detail(namespace, slug),
    queryFn: ({ signal }) => getDshPlugin(namespace, slug, signal),
    enabled: enabled && Boolean(namespace) && Boolean(slug),
  })
}

export function useMyDshPlugins(page: number, q: string) {
  return useQuery({
    queryKey: pluginKeys.mine(page, q),
    queryFn: ({ signal }) => listMyDshPlugins({ page, q, size: 12 }, signal),
    placeholderData: keepPreviousData,
  })
}

function useInvalidatePlugins() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: pluginKeys.all })
  }
}

export function useDshPluginPackagePreview(namespace: string, file: File | null) {
  return useQuery({
    queryKey: [
      'dsh-plugins',
      'preview',
      namespace,
      file?.name,
      file?.size,
      file?.lastModified,
    ] as const,
    queryFn: () => previewDshPluginPackage(namespace, file as File),
    enabled: Boolean(namespace) && file !== null,
    retry: false,
  })
}

export function usePublishDshPlugin() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { namespace: string; file: File; input: DshPluginPublishInput }) =>
      publishDshPlugin(variables.namespace, variables.file, variables.input),
    onSuccess: invalidate,
  })
}

export function useUpdateDshPlugin() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; input: DshPluginMetadataInput }) =>
      updateDshPlugin(variables.pluginId, variables.input),
    onSuccess: invalidate,
  })
}

export function useYankDshPluginVersion() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; versionId: number; reason?: string }) =>
      yankDshPluginVersion(variables.pluginId, variables.versionId, variables.reason),
    onSuccess: invalidate,
  })
}

export function useUnyankDshPluginVersion() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; versionId: number }) =>
      unyankDshPluginVersion(variables.pluginId, variables.versionId),
    onSuccess: invalidate,
  })
}

export function useRecommendDshPluginVersion() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; versionId: number }) =>
      recommendDshPluginVersion(variables.pluginId, variables.versionId),
    onSuccess: invalidate,
  })
}

export function useDeleteDshPluginVersion() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; versionId: number }) =>
      deleteDshPluginVersion(variables.pluginId, variables.versionId),
    onSuccess: invalidate,
  })
}

export function useSetDshPluginHidden() {
  const invalidate = useInvalidatePlugins()
  return useMutation({
    mutationFn: (variables: { pluginId: number; hidden: boolean }) =>
      setDshPluginHidden(variables.pluginId, variables.hidden),
    onSuccess: invalidate,
  })
}

export { pluginKeys }
