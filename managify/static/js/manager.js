const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
const SKIPPED_COLUMNS = 2;
let numberOfRequests = 0;
let resolvedRequests = 0;
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
    // showLoader();
    updateFilterOptions();
    // drawTable(() => hideLoader());
    await updateTable();
}

async function toggleAndUpdateTable(id, name) {
    toggleToList({id, name});
    toggleNoDataContent()
    await updateTable().then(() => {
        if (!(Boolean(storedData.data) && Boolean(storedData.data.length))) {
            deleteTableFromDOM();
        }
    });

}

async function updateTable() {
    storedData = await getPlaylistTracks(chosenPlaylists);
    drawTable();
}

function drawTable(onDraw) {
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
                    title: 'filterbtn',
                    "data-target": "modal1"
                }
            }
        ],
        // scrollY: (getPageHeight() - 350) + "px",
        // scrollX: true,
        // scrollCollapse: true,
        // fixedColumns: true
    }

    // deleteTableFromDOM();
    // const existingColumns = new Set(JSON.parse(JSON.stringify(storedData.columns)));
    // new Set(JSON.parse(JSON.stringify(filterOptions))).forEach((item) => existingColumns.add(item));
    // storedData.columns = JSON.parse(JSON.stringify([...existingColumns]));
    // const optionWithData = Object.assign(options, storedData);
    // const table = $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    const optionWithData = Object.assign(options, storedData)
    optionWithData.columns.push(...filterOptions)
    deleteTableFromDOM()
    const table = $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    $(`${prefixHash(SONG_TABLE_ID)} tbody`).on('click', 'tr', function (element) {
        if (!($(element.target).is("input") || $(element.target).hasClass("playlistCheckBox"))) {
            onClickRow(this, table);
        }
    });
}

function deleteTableFromDOM() {
    //clear old data table
    if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
        const dtApi = $(prefixHash(SONG_TABLE_ID)).DataTable();
        dtApi.destroy();
        document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = initTableHTML;
    }
}

function formatSongColumn(row, columnIndex, imageUrl, songName) {
    //TODO: make this hoverable
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
                        <span class="playlistCheckBox"></span>
                  </label>`
    $(`td:eq(${columnIndex})`, row).html(checkbox);
}

function handleCheckbox(target, payload) {
    console.log("To do api request to add and remove from playlist");
    console.log(target.checked);
    console.log(payload.songId);
}

async function getPlaylistTracks(playlists) {
    numberOfRequests++;
    handleSpinnerState();
    return fetch(`api/sp/playlist`, {method: 'post', body: JSON.stringify(playlists), cache: "reload"})
        .then((response) => {
            return response.json()
        }).finally((() => {
            resolvedRequests++
            handleSpinnerState();
        }));

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

function onClickRow(context, table) {
    const song = table.row(context).data()
    console.log(song.Song)
    table.rows().every(function () {
        this.nodes().to$().removeClass('red lighten-5')
    })

    const $row = table.row(context).nodes().to$();
    const hasClass = $row.hasClass('red lighten-5');
    if (hasClass) {
        $row.removeClass('red lighten-5')
    } else {
        $row.addClass('red lighten-5')
    }
}

function handleSpinnerState() {
    showLoader();
    if (resolvedRequests === numberOfRequests) {
        hideLoader();
    }
}

function appliedData() {
    //table.rows( { order: 'applied' } ).data()
}

function getPageHeight() {
    const body = document.body, html = document.documentElement;
    return Math.max(body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight);
}

function showLoader() {
    document.getElementById("data-loader").style.visibility = "visible";
}

function hideLoader() {
    document.getElementById("data-loader").style.visibility = "hidden";

}
