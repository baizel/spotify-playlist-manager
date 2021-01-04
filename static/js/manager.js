const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
let chosenPlaylists = [];
let storedData = {}

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
    chosenPlaylists.push({id, name})
    await getPlaylistTracks(chosenPlaylists, (data) => {
        storedData = data;
        let options = {
            "ordering": false,
            "paging": false
            // "createdRow": function (row, data, index) {
            //     if (data[5].replace(/[\$,]/g, '') * 1 > 150000) {
            //         $('td', row).eq(5).addClass('highlight');
            //     }
            // },
        }

        const optionWithData = Object.assign(options, storedData)
        if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
            //clear old data table
            const dtApi = $(prefixHash(SONG_TABLE_ID)).DataTable();
            dtApi.destroy();
            document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = `<table id="${SONG_TABLE_ID}"> -</table>`
        }
        $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    })

}

async function getPlaylistTracks(playlists, callback) {
    fetch(`/playlist`, {method: 'post', body: JSON.stringify(playlists)})
        .then(response => response.json())
        .then(callback);
}

function prefixHash(val) {
    return '#' + val;
}