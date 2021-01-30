const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
const SKIPPED_COLUMNS = 2;
let initTableHTML = undefined
let chosenPlaylists = [];
let storedData = {}
let filterOptions = [];


window.onload = function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
    const modalElem = document.querySelectorAll('.modal');
    const modalInstance = M.Modal.init(modalElem, {onCloseEnd: handleFilterChange});
    updateFilterOptions();
}

function updateFilterOptions() {
    const checkboxes = document.querySelectorAll('input[name="filterCheckbox"]:checked');
    filterOptions = [];
    Array.prototype.forEach.call(checkboxes, function (el) {
        filterOptions.push({title: el.value, data: el.id});
    });
}

async function handleFilterChange() {
    updateFilterOptions();
    await updateTable();
}

async function toggleAndUpdateTable(id, name) {
    toggleToList({id, name});
    toggleNoDataContent()
    await updateTable().then(() => {
        if (!Boolean(storedData.data.length)) {
            deleteTableFromDOM();
        }
    });

}

async function updateTable() {
    const data = await getPlaylistTracks(chosenPlaylists);
    storedData = data;
    const options = {
        "dom": 'Blfrtir',
        "ordering": true,
        "order": [],
        "paging": false,
        "createdRow": function (row, data, index) {
            const imageUrl = data.images[2] ? data.images[2].url : "";
            const songName = data.Song;
            formatSongColumn(row, 0, imageUrl, songName);
            for (let i = SKIPPED_COLUMNS; i < storedData.columns.length - filterOptions.length; i++) {
                let payload = {
                    songId: data.id,
                    playlistId: storedData.columns[i].id
                };
                formatCheckboxColumns(row, i, payload, Boolean(data[storedData.columns[i].data]));
            }
        },
        "rowCallback": function (row, data, displayNum, displayIndex, dataIndex) {
        },
        buttons: [
            {
                text: "Column Filter",
                className: 'btn modal-trigger pink waves-effect waves-light',
                attr: {
                    title: 'Copy',
                    id: 'copyButton',
                    "data-target": "modal1"
                }
            }
        ]
    }

    const optionWithData = Object.assign(options, storedData)
    optionWithData.columns.push(...filterOptions)
    deleteTableFromDOM()
    $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);

}

function deleteTableFromDOM() {
    //clear old data table
    if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
        const dtApi = $(prefixHash(SONG_TABLE_ID)).DataTable();
        dtApi.destroy();
        document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = initTableHTML;
        console.log("called")
    }
}

function formatSongColumn(row, columnIndex, imageUrl, songName) {
    const imgHTML = `<div class="valign-wrapper">
                        <img src="${imageUrl}" alt="album art" class="circle" height="32">
                        <span class="song-name">${songName}</span>
                    </div>`
    $(`td:eq(${columnIndex})`, row).html(imgHTML);
}

function formatCheckboxColumns(row, columnIndex, payload, isChecked) {
    const isCheckedAttr = isChecked ? "checked" : "";
    const pld = JSON.stringify(payload);
    const checkbox = `<label>
                        <input type="checkbox" ${isCheckedAttr} onclick='handleCheckbox(this, ${pld})'>
                        <span></span>
                  </label>`
    $(`td:eq(${columnIndex})`, row).html(checkbox);
}

function handleCheckbox(target, payload) {
    console.log("To do api request to add and remove from playlist");
    console.log(target.checked);
    console.log(payload.songId);
}

async function getPlaylistTracks(playlists) {
    return fetch(`api/sp/playlist`, {method: 'post', body: JSON.stringify(playlists)})
        .then((response) => {
            return response.json()
        });

}

function toggleToList(playlist) {
    const isPlaylistAlreadyChosen = chosenPlaylists.some(plst => plst.id === playlist.id)
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

function toggleNoDataContent() {
    if (chosenPlaylists.length > 0) {
        document.getElementsByClassName("nodata")[0].style.display = 'none';
    } else {
        document.getElementsByClassName("nodata")[0].style.display = 'block';
    }
}

function prefixHash(val) {
    return '#' + val;
}