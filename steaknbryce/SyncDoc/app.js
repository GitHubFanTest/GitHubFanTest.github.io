const WS_URL = "wss://a32516-9efc.d.jrnm.app";
const socket = new WebSocket(WS_URL);

let localKanbanState = { todo: [], doing: [], done: [] };

const markdownInput = document.getElementById("markdown-input");
const htmlPreview = document.getElementById("html-preview");
const userStatusEl = document.getElementById("user-status");

const myUsername = prompt("Enter your username for SyncDoc:") || "BloxyBryce";

socket.addEventListener("open", () => {
  console.log("Connected to live SyncDoc server!");
  socket.send(
    JSON.stringify({
      event: "user-joined",
      payload: { username: myUsername },
    }),
  );
});

socket.addEventListener("message", (messageEvent) => {
  const data = JSON.parse(messageEvent.data);

  switch (data.event) {
    case "init":
      updateEditorText(data.docContent);
      if (data.kanban) {
        localKanbanState = data.kanban;
        renderKanban();
      }
      break;

    case "text-changed":
      if (data.payload && data.payload.content !== undefined) {
        updateEditorText(data.payload.content);
      }
      break;

    case "user-joined":
      userStatusEl.innerText = `👤 ${myUsername} (Online: ${data.payload.online.length})`;
      break;

    case "user-left":
      if (data.payload.online) {
        userStatusEl.innerText = `👤 ${myUsername} (Online: ${data.payload.online.length})`;
      }
      break;

    case "card-moved":
      if (data.payload && data.payload.cards) {
        // Completely swap out columns with what the server says is true
        localKanbanState = data.payload.cards;
        renderKanban();
      }
      break;
  }
});

markdownInput.addEventListener("input", () => {
  htmlPreview.innerHTML = marked.parse(markdownInput.value);
  socket.send(
    JSON.stringify({
      event: "text-changed",
      payload: { content: markdownInput.value },
    }),
  );
});

// Safely updates text without breaking your typing cursor focus position
function updateEditorText(newText) {
  // FIX: If newText is undefined, null, or empty, default it to a blank string
  if (newText === undefined || newText === null) {
    newText = "";
  }

  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;

  markdownInput.value = newText;
  htmlPreview.innerHTML = marked.parse(newText);

  markdownInput.setSelectionRange(start, end);
}

// RENDER KANBAN WITH DELETE BUTTONS
function renderKanban() {
  ["todo", "doing", "done"].forEach((column) => {
    const listEl = document.getElementById(`list-${column}`);
    listEl.innerHTML = "";

    const taskArray = localKanbanState[column] || [];
    taskArray.forEach((taskText, index) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.draggable = true;

      // Task text element
      const textSpan = document.createElement("span");
      textSpan.innerText = taskText;
      card.appendChild(textSpan);

      // Delete Button (×)
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-card-btn";
      deleteBtn.innerHTML = "&times;";
      deleteBtn.title = "Delete Task";

      // Delete execution logic
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Stop drag triggers
        deleteCard(column, index, taskText);
      });

      card.appendChild(deleteBtn);

      card.id = `card-${column}-${index}`;
      card.setAttribute("data-origin", column);
      card.setAttribute("data-index", index);

      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.setData("origin-column", column);
        e.dataTransfer.setData("origin-index", index);
      });

      listEl.appendChild(card);
    });
  });
}

function allowDrop(ev) {
  ev.preventDefault();
}

function drop(ev, destColumn) {
  ev.preventDefault();
  const sourceColumn = ev.dataTransfer.getData("origin-column");
  const sourceIndex = parseInt(ev.dataTransfer.getData("origin-index"), 10);

  if (sourceColumn === destColumn) return;

  // Grab task string value using array coordinates
  const taskValue = localKanbanState[sourceColumn][sourceIndex];

  // Remove from old location, push to new column
  localKanbanState[sourceColumn].splice(sourceIndex, 1);
  if (!localKanbanState[destColumn]) localKanbanState[destColumn] = [];
  localKanbanState[destColumn].push(taskValue);

  renderKanban();
  broadcastKanbanChange("move", sourceColumn, destColumn);
}

function addNewCard(column) {
  const text = prompt("Enter task title:");
  if (!text) return;

  if (!localKanbanState[column]) localKanbanState[column] = [];
  localKanbanState[column].push(text);
  renderKanban();

  broadcastKanbanChange("add", column, column);
}

// NEW: Delete local state card and fire changes out to server
function deleteCard(column, index, taskText) {
  localKanbanState[column].splice(index, 1);
  renderKanban();
  broadcastKanbanChange("delete", column, column);
}

// Central helper to send the formatted layout arrays to Steak's backend structure
function broadcastKanbanChange(actionType, fromCol, toCol) {
  socket.send(
    JSON.stringify({
      event: "card-moved",
      payload: {
        cardId: `action-${actionType}`,
        from: fromCol,
        to: toCol,
        cards: localKanbanState,
      },
    }),
  );
}
