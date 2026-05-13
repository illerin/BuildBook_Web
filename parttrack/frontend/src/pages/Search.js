import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

function partCategory(part) {
  if (!part.category_name) return 'Uncategorized';
  return part.parent_category_name ? `${part.parent_category_name} / ${part.category_name}` : part.category_name;
}

function ResultSection({ title, count, children }) {
  return (
    <section className="card search-section">
      <div className="card-title-row">
        <h3>{title}</h3>
        <span className="muted">{count}</span>
      </div>
      {count ? children : <p className="muted">No matches.</p>}
    </section>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const trimmed = query.trim();
  const total = useMemo(() => {
    if (!results) return 0;
    return Object.values(results.results).reduce((sum, rows) => sum + rows.length, 0);
  }, [results]);

  useEffect(() => {
    const urlQuery = params.get('q') || '';
    setQuery((current) => (current === urlQuery ? current : urlQuery));
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!trimmed) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr('');
      try {
        const data = await api.globalSearch(trimmed);
        setResults(data);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const updateQuery = (value) => {
    setQuery(value);
    if (value.trim()) setParams({ q: value });
    else setParams({});
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p className="page-subtitle">Find projects, parts, datasheets, project files, and import drafts.</p>
        </div>
      </div>

      <div className="search-hero">
        <input
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search by part, project, file, datasheet, storage location..."
          autoFocus
        />
        {query && <button className="btn btn-secondary" onClick={() => updateQuery('')}>Clear</button>}
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {loading && <div className="loading">Searching...</div>}
      {!loading && trimmed && results && <p className="muted search-total">{total} result(s) for "{results.query}"</p>}
      {!trimmed && <div className="empty">Start typing to search across the app.</div>}

      {!loading && results && (
        <div className="search-grid">
          <ResultSection title="Projects" count={results.results.projects.length}>
            <div className="search-list">
              {results.results.projects.map((project) => (
                <Link key={project.id} to={`/projects/${project.id}`}>
                  <strong>{project.name}</strong>
                  <span>{project.status} project</span>
                </Link>
              ))}
            </div>
          </ResultSection>

          <ResultSection title="Parts" count={results.results.parts.length}>
            <div className="search-list">
              {results.results.parts.map((part) => (
                <Link key={part.id} to={`/parts?part=${part.id}&search=${encodeURIComponent(part.name)}`}>
                  <strong>{part.name}</strong>
                  <span>{partCategory(part)}{part.storage_location ? ` · ${part.storage_location}` : ''}</span>
                </Link>
              ))}
            </div>
          </ResultSection>

          <ResultSection title="Project Files" count={results.results.files.length}>
            <div className="search-list">
              {results.results.files.map((file) => (
                <Link key={file.id} to={`/projects/${file.project_id}`}>
                  <strong>{file.original_filename}</strong>
                  <span>{file.project_name} · {file.file_category || file.file_type}{file.is_latest ? ' · latest' : ''}</span>
                </Link>
              ))}
            </div>
          </ResultSection>

          <ResultSection title="Part Documents" count={results.results.documents.length}>
            <div className="search-list">
              {results.results.documents.map((doc) => (
                <Link key={doc.id} to={`/parts?part=${doc.part_id}`}>
                  <strong>{doc.original_filename}</strong>
                  <span>{doc.part_name} · {doc.file_type}</span>
                </Link>
              ))}
            </div>
          </ResultSection>

          <ResultSection title="Imports" count={results.results.imports.length}>
            <div className="search-list">
              {results.results.imports.map((item) => (
                <Link key={item.id} to="/imports">
                  <strong>{item.raw_name}</strong>
                  <span>{item.original_filename || `Batch ${item.import_batch_id}`} · {item.status}</span>
                </Link>
              ))}
            </div>
          </ResultSection>
        </div>
      )}
    </div>
  );
}
