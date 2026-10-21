import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PERMISSIONS } from '@toka/contracts';
import { useAskMutation, useIngestMutation } from '@/api/agent';
import { useGetRoleOptionsQuery } from '@/api/users';
import { ChatIcon, DatabaseIcon, FileIcon, SendIcon, UploadIcon } from '@/components/icons';
import { ErrorMessage, Spinner } from '@/components/shared';
import { useAppDispatch, useCan } from '@/store/hooks';
import { notify } from '@/store/notifications';

export const ingestSchema = z.object({
  docId: z.string().min(1, 'El identificador es obligatorio').max(128, 'Máximo 128 caracteres'),
  source: z.string().min(1, 'La fuente es obligatoria').max(256, 'Máximo 256 caracteres'),
  roleScope: z.array(z.string()).min(1, 'Selecciona al menos un rol'),
  text: z.string().min(1, 'El texto es obligatorio').max(200000, 'Máximo 200000 caracteres'),
});
type IngestValues = z.infer<typeof ingestSchema>;

function IngestSection() {
  const dispatch = useAppDispatch();
  const [ingest, { isLoading, error }] = useIngestMutation();
  const { data: roleData } = useGetRoleOptionsQuery();
  const roles = Array.isArray(roleData) ? roleData : [];
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<IngestValues>({
    resolver: zodResolver(ingestSchema),
    defaultValues: { docId: '', source: '', roleScope: [], text: '' },
  });
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  const scope = watch('roleScope');
  const textLen = (watch('text') ?? '').length;

  async function loadFile(file?: File) {
    if (!file) return;
    const content = await file.text();
    const base = file.name.replace(/\.(md|txt)$/i, '');
    setFileName(file.name);
    setValue('text', content, { shouldValidate: true });
    setValue('docId', base.slice(0, 128), { shouldValidate: true });
    setValue('source', file.name.slice(0, 256), { shouldValidate: true });
  }

  async function onSubmit(v: IngestValues) {
    try {
      const res = await ingest(v).unwrap();
      dispatch(notify('success', `Documento indexado: ${res.chunks} fragmentos`));
      reset();
      setFileName('');
    } catch {
      /* el error se muestra via ErrorMessage */
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="stack" noValidate aria-label="Cargar conocimiento">
      <label
        className={`dropzone${dragging ? ' is-drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void loadFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="dropzone-icon" aria-hidden="true">
          {fileName ? <FileIcon size={20} /> : <UploadIcon size={20} />}
        </span>
        <span className="dropzone-text">
          <span>{fileName || 'Arrastra un archivo o haz clic para elegirlo'}</span>
          <span className="sub">
            {fileName ? `${textLen.toLocaleString('es')} caracteres · el contenido se cargó abajo` : 'Formatos .md o .txt'}
          </span>
        </span>
        <span className="btn btn-secondary" aria-hidden="true">
          Examinar
        </span>
        <input id="ing-file" type="file" accept=".md,.txt" aria-label="Archivo (.md, .txt)" onChange={(e) => void loadFile(e.target.files?.[0])} />
      </label>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="ing-doc">Identificador</label>
          <input className="input input-mono" id="ing-doc" placeholder="politica-vacaciones" {...register('docId')} />
          {errors.docId && <span className="field-error">{errors.docId.message}</span>}
        </div>
        <div className="field">
          <label htmlFor="ing-src">Fuente</label>
          <input className="input" id="ing-src" placeholder="Manual de RH, v2" {...register('source')} />
          {errors.source && <span className="field-error">{errors.source.message}</span>}
        </div>
      </div>
      <fieldset className="field role-chips">
        <legend>Roles con acceso</legend>
        {roles.map((r) => (
          <label key={r.id} className="role-chip">
            <input
              type="checkbox"
              checked={scope.includes(r.name)}
              onChange={(e) =>
                setValue('roleScope', e.target.checked ? [...scope, r.name] : scope.filter((n) => n !== r.name), {
                  shouldValidate: true,
                })
              }
            />
            {r.name}
          </label>
        ))}
        {errors.roleScope && <span className="field-error">{errors.roleScope.message}</span>}
      </fieldset>
      <div className="field">
        <label htmlFor="ing-text">Contenido</label>
        <textarea className="input input-mono" id="ing-text" rows={10} placeholder="Pega aquí el texto o carga un archivo arriba" {...register('text')} />
        {errors.text && <span className="field-error">{errors.text.message}</span>}
      </div>
      {error && <ErrorMessage error={error} />}
      <div className="ingest-actions">
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          <DatabaseIcon />
          {isLoading ? 'Indexando…' : 'Indexar documento'}
        </button>
        <span className="agent-hint">{scope.length ? 'Listo para indexar.' : 'Elige al menos un rol con acceso.'}</span>
      </div>
    </form>
  );
}

type Msg = {
  role: 'user' | 'agent';
  text: string;
  degraded?: boolean;
  sources?: { docId: string; source: string; score: number }[];
};
const SUGGESTIONS = ['¿Qué permisos tiene el rol operador?', '¿Cómo doy de alta a un usuario?', 'Resume la última actividad de auditoría'];

export function AgentPage() {
  const [question, setQuestion] = useState('');
  const [ask, { isLoading, error }] = useAskMutation();
  const [validation, setValidation] = useState('');
  const [mode, setMode] = useState<'ask' | 'ingest'>('ask');
  const [messages, setMessages] = useState<Msg[]>([]);
  const canIngest = useCan(PERMISSIONS.AGENT_INGEST);
  const showIngest = canIngest && mode === 'ingest';

  async function send(text: string) {
    const q = text.trim();
    if (!q) {
      setValidation('Escribe una pregunta');
      return;
    }
    if (isLoading) return;
    setValidation('');
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    try {
      const res = await ask({ question: q }).unwrap();
      setMessages((m) => [...m, { role: 'agent', text: res.answer, degraded: res.degraded, sources: res.sources }]);
    } catch {
      /* el error se muestra via ErrorMessage */
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(question);
  }

  return (
    <section className="page agent-page">
      <header className="page-header">
        <div className="users-heading">
          <div className="accent-bar" />
          <h1>Agente</h1>
          <span className="users-count">Consulta la base de conocimiento{canIngest ? ' o agrega documentos' : ''}</span>
        </div>
        {canIngest && (
          <div className="seg" role="radiogroup" aria-label="Modo">
            <label className="seg-opt">
              <input type="radio" name="mode" checked={mode === 'ask'} onChange={() => setMode('ask')} />
              <ChatIcon />
              Preguntar
            </label>
            <label className="seg-opt">
              <input type="radio" name="mode" checked={mode === 'ingest'} onChange={() => setMode('ingest')} />
              <UploadIcon />
              Cargar conocimiento
            </label>
          </div>
        )}
      </header>
      {showIngest && <IngestSection />}
      {!showIngest && (
        <>
          {messages.length === 0 && !isLoading && (
            <div className="agent-empty">
              <span className="lead">¿Qué quieres saber?</span>
              <span className="hint">El agente responde con los documentos a los que tu rol tiene acceso.</span>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn btn-secondary" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-log">
            {messages.map((m, i) => (
              <div key={i} className={`msg-row${m.role === 'user' ? ' is-user' : ''}`}>
                <div className={`msg${m.role === 'user' ? ' is-user' : ''}`}>
                  {m.degraded && (
                    <p role="note">
                      <span className="tag tag-outline">Respuesta degradada: el modelo no estuvo disponible.</span>
                    </p>
                  )}
                  <p>{m.text}</p>
                  {m.sources && m.sources.length > 0 && (
                    <ul aria-label="Fuentes" className="msg-sources">
                      <li className="label">Fuentes</li>
                      {m.sources.map((s) => (
                        <li key={s.docId} className="tag tag-neutral">
                          <FileIcon size={12} />
                          {s.source} ({s.score.toFixed(2)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isLoading && <Spinner label="Consultando al agente…" />}
          {error && <ErrorMessage error={error} />}
          <form onSubmit={onSubmit} className="composer">
            <textarea
              className="input"
              rows={2}
              placeholder="Escribe tu pregunta…"
              aria-label="Pregunta"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(question);
                }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              <SendIcon />
              Preguntar
            </button>
          </form>
          {validation && <span className="field-error">{validation}</span>}
          <span className="agent-hint">Enter para enviar · Shift + Enter para salto de línea</span>
        </>
      )}
    </section>
  );
}
