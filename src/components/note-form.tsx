import {
  autocompletion,
  closeBrackets,
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete"
import { history } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { EditorView, placeholder, ViewUpdate } from "@codemirror/view"
import { parseDate } from "chrono-node"
import clsx from "clsx"
import { Searcher } from "fast-fuzzy"
import React from "react"
import { GlobalStateContext, NoteId } from "../global-state"
import { formatDate } from "../utils/date"
import { Button, IconButton } from "./button"
import { Card } from "./card"
import { CloseIcon16, PaperclipIcon16 } from "./icons"
import { Tooltip } from "./tooltip"

type NoteFormProps = {
  id?: NoteId
  defaultBody?: string
  codeMirrorViewRef?: React.MutableRefObject<EditorView | undefined>
  onSubmit?: (note: { id: NoteId; body: string }) => void
  onCancel?: () => void
}

export function NoteForm({
  id,
  defaultBody = "",
  codeMirrorViewRef,
  onSubmit,
  onCancel,
}: NoteFormProps) {
  const globalState = React.useContext(GlobalStateContext)

  const [editorHasFocus, setEditorHasFocus] = React.useState(false)

  const {
    editorRef,
    view,
    value: body = "",
  } = useCodeMirror({
    defaultValue: defaultBody,
    placeholder: "Write something",
    viewRef: codeMirrorViewRef,
    onStateChange: (event) => setEditorHasFocus(event.view.hasFocus),
  })

  function handleSubmit() {
    // Don't create empty notes
    if (!body) return

    const note = {
      id: id ?? Date.now().toString(),
      body: body,
    }

    globalState.service?.send({
      type: "UPSERT_NOTE",
      ...note,
    })

    onSubmit?.(note)

    // If we're creating a new note, reset the form after submitting
    if (!id) {
      view?.dispatch({
        changes: [{ from: 0, to: body.length, insert: defaultBody }],
      })
    }
  }

  return (
    <Card
      className={clsx(
        "p-2",
        editorHasFocus && "outline outline-2 outline-offset-[-1px] outline-border-focus",
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          handleSubmit()
          event.preventDefault()
        }}
        onKeyDown={(event) => {
          // Submit on `command + enter`
          if (event.key === "Enter" && event.metaKey) {
            handleSubmit()
            event.preventDefault()
          }

          // Cancel on `escape`
          if (event.key === "Escape") {
            onCancel?.()
          }
        }}
      >
        <div ref={editorRef} className="p-2" />
        <div className="flex justify-between">
          <IconButton>
            <PaperclipIcon16 />
          </IconButton>
          <div className="flex gap-2">
            {onCancel ? (
              <Tooltip>
                <Tooltip.Trigger asChild>
                  <Button onClick={onCancel}>Cancel</Button>
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom">esc</Tooltip.Content>
              </Tooltip>
            ) : null}
            <Tooltip>
              <Tooltip.Trigger asChild>
                <Button type="submit" variant="primary">
                  {id ? "Save" : "Add"}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom">⌘⏎</Tooltip.Content>
            </Tooltip>
          </div>
        </div>
      </form>
    </Card>
  )
}

// Reference: https://www.codiga.io/blog/implement-codemirror-6-in-react/
function useCodeMirror({
  defaultValue,
  placeholder: placeholderValue = "",
  viewRef: providedViewRef,
  onStateChange,
}: {
  defaultValue?: string
  placeholder?: string
  viewRef?: React.MutableRefObject<EditorView | undefined>
  onStateChange?: (event: ViewUpdate) => void
}) {
  const [editorElement, setEditorElement] = React.useState<HTMLElement>()
  const editorRef = React.useCallback((node: HTMLElement | null) => {
    if (!node) return

    setEditorElement(node)
  }, [])

  const newViewRef = React.useRef<EditorView>()
  const viewRef = providedViewRef ?? newViewRef

  const [value, setValue] = React.useState(defaultValue)

  const noteCompletion = useNoteCompletion()
  const tagCompletion = useTagCompletion()

  React.useEffect(() => {
    if (!editorElement) return

    const state = EditorState.create({
      doc: defaultValue,
      extensions: [
        placeholder(placeholderValue),
        history(),
        EditorView.updateListener.of((event) => {
          const value = event.view.state.doc.sliceString(0)
          setValue(value)
          onStateChange?.(event)
        }),
        closeBrackets(),
        autocompletion({
          override: [noteCompletion, dateCompletion, tagCompletion],
          icons: false,
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorElement,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  }, [editorElement])

  return { editorRef, view: viewRef.current, value }
}

function dateCompletion(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/(\[\[)?\w*/)

  if (!word) {
    return null
  }

  // Ignore words inside internal links
  if (word.text.startsWith("[[")) {
    return null
  }

  const date = parseDate(word.text)

  if (!date) {
    return null
  }

  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const dateString = `${year}-${month}-${day}`

  return {
    from: word.from,
    options: [
      {
        label: formatDate(dateString),
        apply: `[[${dateString}]]`,
      },
    ],
    filter: false,
  }
}

function useTagCompletion() {
  const globalState = React.useContext(GlobalStateContext)

  const tagCompletion = React.useCallback(
    async (context: CompletionContext): Promise<CompletionResult | null> => {
      const word = context.matchBefore(/#[\w\-_\d]*/)

      if (!word) {
        return null
      }

      const tags = Object.keys(globalState.service.getSnapshot().context.tags)

      return {
        from: word.from + 1,
        options: tags.map((name) => ({ label: name })),
      }
    },
    [globalState],
  )

  return tagCompletion
}

function useNoteCompletion() {
  const globalState = React.useContext(GlobalStateContext)

  const noteCompletion = React.useCallback(
    async (context: CompletionContext): Promise<CompletionResult | null> => {
      const word = context.matchBefore(/\[\[[^\]|^|]*/)

      if (!word) {
        return null
      }

      // "[[<query>" -> "<query>"
      const query = word.text.slice(2)

      if (!query) {
        return null
      }

      const entries = Object.entries(globalState.service.getSnapshot().context.notes)

      // Create a search index
      const searcher = new Searcher(entries, {
        keySelector: (entry) => entry[1],
        threshold: 0.8,
      })

      const results = searcher.search(query)

      const createNewNoteOption: Completion = {
        label: `Create new note "${query}"`,
        apply: (view, completion, from, to) => {
          const note = {
            id: Date.now().toString(),
            body: query,
          }

          // Create new note
          globalState.service.send({
            type: "UPSERT_NOTE",
            ...note,
          })

          // Insert link to new note
          const text = `${note.id}|${query}`
          const anchor = from + text.length
          const head = anchor - query.length

          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor, head },
          })
        },
      }

      const options = [
        ...results.slice(0, 6).map(
          ([id, body]): Completion => ({
            label: body,
            info: body,
            apply: (view, completion, from, to) => {
              // Insert link to note
              const text = `${id}|${query}`
              const anchor = from + text.length
              const head = anchor - query.length

              view.dispatch({
                changes: { from, to, insert: text },
                selection: { anchor, head },
              })
            },
          }),
        ),
        createNewNoteOption,
      ]

      return {
        from: word.from + 2, // Insert after "[["
        options,
        filter: false,
      }
    },
    [globalState],
  )

  return noteCompletion
}
