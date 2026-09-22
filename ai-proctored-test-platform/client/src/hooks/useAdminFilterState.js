import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useAdminFilterState
 * Platform-wide hook for preserving search, filters, active tabs, and sub-views across navigation (FEATURE-021).
 *
 * Synchronizes state with URL search parameters (useSearchParams):
 * - Reads current search params on mount & back/forward navigation.
 * - Writes updated filters with `replace: true` to avoid cluttering browser history.
 * - Omits default / empty values from URL to keep URLs clean.
 *
 * @param {Object} defaultValues - Key-value map of default state (e.g. { search: '', type: 'ALL', status: 'ALL' })
 * @returns {[Object, Function, Function]} [filters, updateFilter, setFilters]
 */
export function useAdminFilterState(defaultValues = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Derive current filters from searchParams or defaultValues
  const filters = useMemo(() => {
    const current = {};
    for (const [key, defaultVal] of Object.entries(defaultValues)) {
      const paramVal = searchParams.get(key);
      if (paramVal !== null && paramVal !== undefined) {
        // If default is boolean or number, cast accordingly
        if (typeof defaultVal === 'boolean') {
          current[key] = paramVal === 'true';
        } else if (typeof defaultVal === 'number') {
          const num = Number(paramVal);
          current[key] = isNaN(num) ? defaultVal : num;
        } else {
          current[key] = paramVal;
        }
      } else {
        current[key] = defaultVal;
      }
    }
    return current;
  }, [searchParams, defaultValues]);

  // 2. Set multiple filters at once
  const setFilters = useCallback(
    (newFiltersOrFn) => {
      setSearchParams(
        (prevParams) => {
          const prevFilters = {};
          for (const [key, defaultVal] of Object.entries(defaultValues)) {
            const paramVal = prevParams.get(key);
            if (paramVal !== null && paramVal !== undefined) {
              if (typeof defaultVal === 'boolean') {
                prevFilters[key] = paramVal === 'true';
              } else if (typeof defaultVal === 'number') {
                const num = Number(paramVal);
                prevFilters[key] = isNaN(num) ? defaultVal : num;
              } else {
                prevFilters[key] = paramVal;
              }
            } else {
              prevFilters[key] = defaultVal;
            }
          }

          const updated =
            typeof newFiltersOrFn === 'function'
              ? newFiltersOrFn(prevFilters)
              : { ...prevFilters, ...newFiltersOrFn };

          const nextParams = new URLSearchParams(prevParams);

          for (const [key, val] of Object.entries(updated)) {
            const defaultVal = defaultValues[key];
            const isDefault =
              val === defaultVal ||
              val === '' ||
              val === null ||
              val === undefined;

            if (isDefault) {
              nextParams.delete(key);
            } else {
              nextParams.set(key, String(val));
            }
          }

          return nextParams;
        },
        { replace: true }
      );
    },
    [defaultValues, setSearchParams]
  );

  // 3. Update a single filter key
  const updateFilter = useCallback(
    (key, value) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [setFilters]
  );

  return [filters, updateFilter, setFilters];
}

export default useAdminFilterState;
