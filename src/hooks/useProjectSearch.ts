import { useRef, useState } from 'react';
import type { ChangeEvent, CompositionEvent, FocusEvent } from 'react';
import { teamLabel, type Project } from '../project';

export function useProjectSearch(projects: readonly Project[]) {
  // The draft and applied query intentionally differ during IME composition.
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const composing = useRef(false);
  const terms = appliedQuery.trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
  const results = projects.filter(project => {
    const searchable = [project.title, teamLabel(project), ...project.techStack].join(' ').toLocaleLowerCase('ko');
    return terms.every(term => searchable.includes(term));
  });

  function commit(value: string) {
    composing.current = false;
    setQuery(value);
    setAppliedQuery(value);
  }

  return {
    results,
    isSearching: terms.length > 0,
    clear: () => commit(''),
    inputProps: {
      value: query,
      onChange(event: ChangeEvent<HTMLInputElement>) {
        setQuery(event.currentTarget.value);
        if (!composing.current) setAppliedQuery(event.currentTarget.value);
      },
      onCompositionStart() { composing.current = true; },
      onCompositionEnd(event: CompositionEvent<HTMLInputElement>) { commit(event.currentTarget.value); },
      onBlur(event: FocusEvent<HTMLInputElement>) { commit(event.currentTarget.value); },
    },
  };
}
