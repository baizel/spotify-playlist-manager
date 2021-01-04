const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
let initTableHTML = undefined
let chosenPlaylists = [];
let storedData = {}

window.onload = function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
}

function removeItemOnce(arr, value) {
    let index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}

function addHeaders(table, keys) {
    removeItemOnce(keys, 'Song');
    removeItemOnce(keys, 'Artist');
    let headerText = ["Song", "Artist", ...keys]
    let header = table.createTHead();
    let row = header.insertRow();
    for (let i = 0; i < headerText.length; i++) {
        let th = document.createElement('th');
        th.innerHTML = headerText[i];
        row.appendChild(th);
    }
    return headerText
}

function addTableBody(table, child, headers) {
    let tbody = document.createElement('tbody');
    let row = tbody.insertRow();
    headers.forEach(function (k) {
        let element;
        let cell = row.insertCell();
        if (k === "Song" || k === "Artist") {
            element = document.createElement('p');
            element.innerHTML = child[k];
        } else {
            element = document.createElement('i');
            element.className = 'material-icons center'
            element.innerHTML = Boolean(child[k]) ? "check" : "clear"
        }
        cell.appendChild(element);
    });
    table.appendChild(tbody);
}

function buildTableHtml(tableId, data) {
    let table = document.createElement('table');
    table.id = tableId;
    let headers = []
    for (let i = 0; i < data.length; i++) {
        let child = data[i];
        if (i === 0) {
            headers = addHeaders(table, Object.keys(child));
        }
        addTableBody(table, child, headers);
    }
    return table;
}

async function updateTable(id, name) {
    toggleToList({id, name})
    await getPlaylistTracks(chosenPlaylists, (data) => {
        storedData = data;
        let options = {
            "ordering": true,
            "order": [],
            "paging": false,
            "createdRow": function (row, data, index) {
                const src = data.images[2] ? data.images[2].url :""
                  let imgHTML = `<div class="valign-wrapper">
                                    <img src="${src}" alt="album art" class="circle" height="32">
                                    <span class="song-name">${data.Song}</span>
                                </div>`
                $('td:eq(0)', row).html(imgHTML);
            },
            "rowCallback": function (row, data, displayNum, displayIndex, dataIndex) {
            },
        }

        const optionWithData = Object.assign(options, storedData)
        if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
            //clear old data table
            const dtApi = $(prefixHash(SONG_TABLE_ID)).DataTable();
            dtApi.destroy();
            document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = initTableHTML;
        }
        $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    })

}

async function getPlaylistTracks(playlists, callback) {
    fetch(`/playlist`, {method: 'post', body: JSON.stringify(playlists)})
        .then(response => response.json())
        .then(callback);
}

function toggleToList(playlist) {
    let isPlaylistAlreadyChosen = chosenPlaylists.some(plst => plst.id === playlist.id)
    if (isPlaylistAlreadyChosen) {
        chosenPlaylists = chosenPlaylists.filter(function (el) {
            return el.id !== playlist.id;
        })
        document.getElementById(playlist.id).classList.remove("added-playlist");
    } else {
        chosenPlaylists.push(playlist)
        document.getElementById(playlist.id).classList.add("added-playlist");
    }
}

function prefixHash(val) {
    return '#' + val;
}