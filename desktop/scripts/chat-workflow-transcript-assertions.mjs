export async function assertTranscriptSequence(client, expectedTexts) {
  const value = await collectTranscriptRows(client);
  if (!value.scrollerMounted) {
    throw new Error("chat transcript scroller was not mounted");
  }
  const renderedFailure = transcriptSequenceFailure(value.rows, expectedTexts);
  if (renderedFailure === null) {
    return;
  }
  const pageValue = await readSelectedConversationTranscriptRows(client);
  const pageFailures = [];
  for (const rowSet of pageValue.rowSets) {
    const pageFailure = transcriptSequenceFailure(rowSet.rows, expectedTexts);
    if (pageFailure === null) {
      return;
    }
    pageFailures.push({ label: rowSet.label, message: pageFailure });
  }
  throw new Error(`${renderedFailure}; preload row sets: ${JSON.stringify(pageFailures)}`);
}

function transcriptSequenceFailure(rows, expectedTexts) {
  let cursorOffset = 0;
  let cursorRow = 0;
  for (const expected of expectedTexts) {
    let match = null;
    for (let rowIndex = cursorRow; rowIndex < rows.length; rowIndex += 1) {
      const textOffset = rowIndex === cursorRow ? cursorOffset : 0;
      const index = rows[rowIndex].text.indexOf(expected, textOffset);
      if (index !== -1) {
        match = { rowIndex, textOffset: index + expected.length };
        break;
      }
    }
    if (!match) {
      return `transcript did not contain ${expected} after row ${cursorRow}: ${JSON.stringify(rows)}`;
    }
    cursorOffset = match.textOffset;
    cursorRow = match.rowIndex;
  }
  return null;
}

async function collectTranscriptRows(client) {
  return client.evaluate(`(async () => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const rowsById = new Map();
    const collectRows = () => {
      const rows = Array.from(document.querySelectorAll('[data-chat-message="true"]'));
      for (const row of rows) {
        const id = row.getAttribute("data-message-id") ?? row.innerText.trim();
        if (!rowsById.has(id)) {
          rowsById.set(id, {
            role: row.getAttribute("data-message-role"),
            text: row.innerText.trim(),
          });
        }
      }
    };
    const settle = () => new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(resolve, 20));
      });
    });
    const scrollToTop = (top) => {
      scroller.scrollTo({ top });
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    };
    if (!scroller) {
      collectRows();
      return {
        rows: Array.from(rowsById.values()),
        scrollerMounted: false,
      };
    }
    scrollToTop(0);
    await settle();
    collectRows();
    for (let index = 0; index < 160; index += 1) {
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (scroller.scrollTop >= maxScrollTop - 1) {
        break;
      }
      const nextScrollTop = Math.min(maxScrollTop, scroller.scrollTop + 24);
      if (nextScrollTop === scroller.scrollTop) {
        break;
      }
      scrollToTop(nextScrollTop);
      await settle();
      collectRows();
    }
    scrollToTop(Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    await settle();
    collectRows();
    return {
      rows: Array.from(rowsById.values()),
      scrollerMounted: true,
    };
  })()`);
}

async function readSelectedConversationTranscriptRows(client) {
  return client.evaluate(`(async () => {
    const session = await window.setta.workspace.session();
    const workspaceId = session.selectedWorkspaceId ?? session.activeWorkspaces[0]?.id ?? "";
    const detail = document.querySelector('[data-testid="chat-detail-pane"][data-conversation-id]');
    let conversationId = detail?.getAttribute("data-conversation-id") ?? "";
    if (workspaceId && !conversationId) {
      const list = await window.setta.chat.listConversations(workspaceId);
      conversationId = list.conversations[0]?.conversation.id ?? "";
    }
    const textOf = (message) => message.parts.map((part) => part.text).join("");
    if (!workspaceId || !conversationId) {
      return {
        rowSets: [{ label: "missing-selection", rows: [] }],
      };
    }
    const page = await window.setta.chat.messagePage(workspaceId, conversationId, 0, 100);
    const messageRows = page.messages
      .toSorted((left, right) => left.ordinal - right.ordinal)
      .map((message) => ({
        role: message.role,
        text: textOf(message),
      }));
    const transcriptRows = [];
    for (const turn of page.transcript) {
      if (turn.triggerMessage) {
        transcriptRows.push({
          role: turn.triggerMessage.role,
          text: textOf(turn.triggerMessage),
        });
      }
      for (const message of turn.steeringMessages) {
        transcriptRows.push({
          role: message.role,
          text: textOf(message),
        });
      }
      if (turn.assistantMessage) {
        transcriptRows.push({
          role: turn.assistantMessage.role,
          text: textOf(turn.assistantMessage),
        });
      }
    }
    return {
      rowSets: [
        { label: "messages", rows: messageRows },
        { label: "transcript", rows: transcriptRows },
      ],
    };
  })()`);
}
