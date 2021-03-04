const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
const SKIPPED_COLUMNS = 2;
let numberOfRequests = 0;
let resolvedRequests = 0;
let initTableHTML = undefined
let chosenPlaylists = [];
let storedData = {}
let filterOptions = [];

document.addEventListener('DOMContentLoaded', function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
    const modalElem = document.querySelectorAll('.modal');
    const modalInstance = M.Modal.init(modalElem, {onCloseEnd: handleFilterChange});
    updateFilterOptions();
});

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

async function toggleAndUpdateTable(id, name, isReadOnly) {
    toggleToList({id, name, isReadOnly});
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
    function draw(setting) {
        initSearchBar();
        setReadOnlyCheckBoxes();
        const func = onDraw || $.noop;
        func(setting);
    }

    const options = {
        // "dom": 'Blfrtir',
        "ordering": true,
        "order": [],
        "paging": false,
        "createdRow": function (row, data, index) {
            const id = data.id;
            const imageUrl = data.images[2] ? data.images[2].url : "";
            const songName = data.Song;
            formatSongColumn(row, 0, {imageUrl, songName});
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
        "drawCallback": draw,
        language: {
            searchPlaceholder: "Search Songs"
        }
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

function formatSongColumn(row, columnIndex, {imageUrl, songName}) {
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
                        <input class="${payload.playlistId}" type="checkbox" ${isCheckedAttr} onclick='handleCheckbox(this, ${pld})'>
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
    console.log(playlists)
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
        document.getElementById('tableContainer').style.display = 'block';
    } else {
        document.getElementsByClassName("nodata")[0].style.display = 'block';
        document.getElementById('tableContainer').style.display = 'none';
    }
}

function prefixHash(val) {
    return '#' + val;
}

function removeClickClass(table) {
    table.rows().every(function () {
        this.nodes().to$().removeClass('rowClick')
    })
}

function onClickRow(context, table) {
    const song = table.row(context).data()
    const tableData = getAppliedData(table);
    playSong(song, tableData) //Should be imported from the other file
    removeClickClass(table);
    applyRowClick(table.row(context).nodes().to$());
}

function handleSpinnerState() {
    showLoader();
    if (resolvedRequests === numberOfRequests) {
        hideLoader();
    }
}

function getAppliedData(table) {
    return table.rows({order: 'applied'}).data().toArray();
}

function getIndexedData(table) {
    return table.rows({order: 'index'}).data().toArray();
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

function initSearchBar() {
    $('.search-toggle').click(function () {
        if ($('.hiddensearch').css('display') === 'none')
            $('.hiddensearch').slideDown();
        else
            $('.hiddensearch').slideUp();
    });
}

function setReadOnlyCheckBoxes() {
    chosenPlaylists.filter(playlist => JSON.parse(playlist.isReadOnly.toLocaleLowerCase())).forEach((playlist) => {
        let checkboxes = document.getElementsByClassName(playlist.id)
        Array.from(checkboxes).forEach((item) => {
            item.disabled = true;
            if (!item.checked) {
                item.indeterminate = true
            }
        });
    })
}

function updateTableSelection(uri) {
    const table = $(prefixHash(SONG_TABLE_ID)).DataTable();
    const tableData = getIndexedData(table);
    const indexOfRow = tableData.findIndex(x => x.uri === uri);
    if (indexOfRow >= 0) {
        removeClickClass(table);
        applyRowClick(table.rows(indexOfRow).nodes().to$());
    }
}

function applyRowClick($clickedRow) {
    const hasClass = $clickedRow.hasClass('rowClick');
    if (hasClass) {
        $clickedRow.removeClass('rowClick')
    } else {
        $clickedRow.addClass('rowClick')
    }
}