// pages/music-player/music-player.js
import { getSongDetail, getSongLyric } from '../../services/player'
import { parseLyric } from "../../utils/parse-lyric"
import playerStore from "../../store/playerStore"
import { hxthrottle } from '../../utils/throttle'

const app = getApp()

// 创建播放器
const audioContext = wx.createInnerAudioContext()

Page({
  data: {
    pageTitles: ['歌曲', '歌词'],
    currentPage: 0,
    contentHeight: 0,
    id: 0,
    currentSong: {},
    lyricInfos: [],
    currentLyricText: '',
    currentLyricIndex: -1,

    currentTime: 0,
    durationTime: 0,
    sliderValue: 0,
    isSliderChanging: false,
    isWaiting: false,
    isPlaying: true,

    lyricScrollTop: 0,

    playSongIndex: 0,
    playSongList: [],
    isFirstPlay: true
  },
  onLoad(options) {
    // 0.获取设备信息
    this.setData({ contentHeight: app.globalData.contentHeight })

    // 1.获取传入的id
    const id = options.id

    // 2.根据id播放歌曲
    this.setupPlaySong(id)
    
    // 5.获取store的共享数据
    playerStore.onStates(['playSongList', 'playSongIndex'], this.getPlaySongInfosHandler)
  },
  updateProgress() {
    // 1.记录当前的时间
    // 2.修改滑块的时间进度sliderValue
    const sliderValue = this.data.currentTime / this.data.durationTime * 100
    this.setData({
      currentTime: audioContext.currentTime * 1000,
      sliderValue
    })
  },

  // ============================= 播放歌曲 =============================
  setupPlaySong(id) {
    this.setData({ id })

    // 2.请求歌曲相关的数据
    // 2.1.根据id获取歌曲的详情
    getSongDetail(id).then(res => {
      this.setData({
        currentSong: res.songs[0],
        durationTime: res.songs[0].dt
      })
    })

    // 2.2.根据id获取歌词信息
    getSongLyric(id).then(res => {
      const lrcString = res.lrc.lyric
      const lyricInfos = parseLyric(lrcString)
      this.setData({ lyricInfos })
    })

    // 3.播放当前的歌曲
    audioContext.src = `https://music.163.com/song/media/outer/url?id=${id}.mp3`
    audioContext.autoplay = true

    // 4.监听播放的进度
    const throttleUpdateProgress = hxthrottle(this.updateProgress, 500, { leading: false })
    audioContext.onTimeUpdate(() => {
      // 1.更新歌曲的进度
      if (!this.data.isSliderChanging && !this.data.isWaiting) {
        throttleUpdateProgress()
      }

      // 2.匹配正确歌词
      if (!this.data.lyricInfos.length) return
      let index = this.data.lyricInfos.length - 1
      for (let i in this.data.lyricInfos) {
        const info = this.data.lyricInfos[i]
        if (info.time > audioContext.currentTime * 1000) {
          index = i - 1
          break
        }
      }
      if (index === this.data.currentLyricIndex) return

      // 3.获取歌词索引index和文本text
      // 4.改变歌词滚动页面的位置
      const currentLyricText = this.data.lyricInfos[index].text
      this.setData({
        currentLyricText,
        currentLyricIndex: index,
        lyricScrollTop: 35 * index
      })
    })
    // 解决拖动进度条之后没有继续监听的bug
    if (this.data.isFirstPlay) {
      this.data.isFirstPlay = false
      audioContext.onWaiting(() => {
        audioContext.pause()
      })
      audioContext.onCanplay(() => {
        audioContext.play()
      })
    }
  },

  // ============================= 事件监听 =============================
  onSwiperChange(event) {
    this.setData({ currentPage: event.detail.current })
  },
  onNavTabItemTap(event) {
    const index = event.currentTarget.dataset.index
    this.setData({ currentPage: index })
  },
  onSliderChange(event) {
    this.data.isWaiting = true
    setTimeout(() => {
      this.data.isWaiting = false
    }, 1500)
    // 1.获取点击滑块位置对应的value
    const value = event.detail.value

    // 2.计算出要播放的位置的时间
    const currentTime = value / 100 * this.data.durationTime

    // 3.设置播放器，播放计算出的时间
    audioContext.seek(currentTime / 1000)
    this.setData({ currentTime, isSliderChanging: false, sliderValue: value })
  },
  onSliderChanging(event) {
    // 1.获取滑动到的位置的value
    const value = event.detail.value

    // 2.根据当前的值，计算出对应的时间
    const currentTime = value / 100 * this.data.durationTime
    this.setData({ currentTime })

    // 3.当前正在滑动
    this.data.isSliderChanging = true
  },

  onPlayOrPauseTap() {
    if (!audioContext.paused) {
      audioContext.pause()
      this.setData({ isPlaying: false })
    } else {
      audioContext.play()
      this.setData({ isPlaying: true })
    }
  },
  onPrevBtnTap() {
    this.changeNewSong(false)
  },
  onNextBtnTap() {
    this.changeNewSong()
  },
  changeNewSong(isNext = true) {
    // 1.获取之前的数据
    const length = this.data.playSongList.length
    let index = this.data.playSongIndex

    // 2.根据之前的数据计算最新的索引
    index = isNext ? index + 1: index - 1
    if (index === length) index = 0
    if (index === -1) index = length - 1

    // 3.根据索引获取当前歌曲的信息
    const newSong = this.data.playSongList[index]
    // console.log(newSong.id);
    // 将数据回到初始状态
    this.setData({
      currentSong: {},
      sliderValue: 0,
      currentTime: 0,
      durationTime: 0
    })
    // 开始播放新的歌曲
    this.setupPlaySong(newSong.id)
    
    // 4.保存最新的索引
    playerStore.setState('playSongIndex', index)
  },


  // ========================= store共享数据 =====================
  getPlaySongInfosHandler({ playSongList, playSongIndex }) {
    if (playSongList) {
      this.setData({ playSongList })
    }
    if (playSongIndex !== undefined) {
      this.setData({ playSongIndex })
    }
  },

  onUnload() {
    playerStore.offStates(['playSongList', 'playSongIndex'], this.getPlaySongInfosHandler)
  }
})