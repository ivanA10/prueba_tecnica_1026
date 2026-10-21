import { useState, type FormEvent } from 'react';
import { useAskMutation } from '@/api/agent';
import { ErrorMessage, Spinner } from '@/components/shared';

export function AgentPage() {
  const [question, setQuestion] = useState('');
  const [ask, { data, isLoading, error }] = useAskMutation();
  const [validation, setValidation] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) {
      setValidation('Escribe una pregunta');
      return;
    }
    setValidation('');
    await ask({ question: question.trim() });
  }

  return (
    <section>
      <h1>Agente</h1>
      <form onSubmit={onSubmit}>
        <label>
          Pregunta
          <input value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        {validation && <span className="field-error">{validation}</span>}
        <button type="submit" disabled={isLoading}>
          Preguntar
        </button>
      </form>
      {isLoading && <Spinner label="Consultando al agente..." />}
      {error && <ErrorMessage error={error} />}
      {data && (
        <div className="chat">
          {data.degraded && <p role="note">Respuesta degradada: el modelo no estuvo disponible.</p>}
          <p>{data.answer}</p>
          {data.sources.length > 0 && (
            <ul aria-label="Fuentes">
              {data.sources.map((s) => (
                <li key={s.docId}>
                  {s.source} ({s.score.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
