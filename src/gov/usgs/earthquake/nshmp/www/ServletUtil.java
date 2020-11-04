package gov.usgs.earthquake.nshmp.www;

import static com.google.common.base.Strings.isNullOrEmpty;
import static gov.usgs.earthquake.nshmp.www.meta.Region.CEUS;
import static gov.usgs.earthquake.nshmp.www.meta.Region.COUS;
import static gov.usgs.earthquake.nshmp.www.meta.Region.WUS;
import static java.lang.Runtime.getRuntime;

import java.net.URI;
import java.net.URL;
import java.nio.file.FileSystem;
import java.nio.file.FileSystemNotFoundException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

import javax.servlet.ServletContext;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import javax.servlet.annotation.WebListener;
import javax.servlet.http.HttpServletRequest;

import com.google.common.base.Stopwatch;
import com.google.common.cache.CacheBuilder;
import com.google.common.cache.CacheLoader;
import com.google.common.cache.LoadingCache;
import com.google.common.util.concurrent.ListeningExecutorService;
import com.google.common.util.concurrent.MoreExecutors;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import gov.usgs.earthquake.nshmp.calc.Site;
import gov.usgs.earthquake.nshmp.calc.ValueFormat;
import gov.usgs.earthquake.nshmp.calc.Vs30;
import gov.usgs.earthquake.nshmp.eq.model.HazardModel;
import gov.usgs.earthquake.nshmp.gmm.Imt;
import gov.usgs.earthquake.nshmp.www.meta.Edition;
import gov.usgs.earthquake.nshmp.www.meta.ParamType;
import gov.usgs.earthquake.nshmp.www.meta.Region;
import gov.usgs.earthquake.nshmp.www.meta.Util;

/**
 * Servlet utility objects and methods.
 *
 * @author Peter Powers
 */
@SuppressWarnings("javadoc")
@WebListener
public class ServletUtil implements ServletContextListener {

  /*
   * Some shared resources may be accessed statically, others, such as models,
   * depend on a context-param and may be accessed as context attributes.
   */

  public static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern(
      "yyyy-MM-dd'T'HH:mm:ssXXX");

  static final ListeningExecutorService CALC_EXECUTOR;
  static final ExecutorService TASK_EXECUTOR;

  static final int THREAD_COUNT;

  public static final Gson GSON;

  static final String MODEL_CACHE_CONTEXT_ID = "model.cache";

  static Model[] INSTALLED_MODELS;

  private static boolean throttleIp = true;
  private static final String THROTTLE_IP_KEY = "throttleIp";

  static {
    /* TODO modified for deagg-epsilon branch; should be context var */
    THREAD_COUNT = getRuntime().availableProcessors();
    CALC_EXECUTOR = MoreExecutors.listeningDecorator(Executors.newFixedThreadPool(THREAD_COUNT));
    TASK_EXECUTOR = Executors.newSingleThreadExecutor();
    GSON = new GsonBuilder()
        .registerTypeAdapter(Edition.class, new Util.EnumSerializer<Edition>())
        .registerTypeAdapter(Region.class, new Util.EnumSerializer<Region>())
        .registerTypeAdapter(Imt.class, new Util.EnumSerializer<Imt>())
        .registerTypeAdapter(Vs30.class, new Util.EnumSerializer<Vs30>())
        .registerTypeAdapter(ValueFormat.class, new Util.EnumSerializer<ValueFormat>())
        .registerTypeAdapter(Double.class, new Util.DoubleSerializer())
        .registerTypeAdapter(ParamType.class, new Util.ParamTypeSerializer())
        .registerTypeAdapter(Site.class, new Util.SiteSerializer())
        .disableHtmlEscaping()
        .serializeNulls()
        .setPrettyPrinting()
        .create();
  }

  @Override
  public void contextDestroyed(ServletContextEvent e) {
    CALC_EXECUTOR.shutdown();
    TASK_EXECUTOR.shutdown();
  }

  @Override
  public void contextInitialized(ServletContextEvent e) {

    final ServletContext context = e.getServletContext();

    String throttle = System.getProperty(THROTTLE_IP_KEY);
    throttleIp = throttle != null ? Boolean.parseBoolean(throttle) : throttleIp;

    INSTALLED_MODELS = Stream.of(Model.values())
        .filter(model -> {
          Path path = Paths.get(context.getRealPath(model.path));
          return Files.isDirectory(path);
        }).toArray(Model[]::new);

    final LoadingCache<Model, HazardModel> modelCache = CacheBuilder.newBuilder().build(
        new CacheLoader<Model, HazardModel>() {
          @Override
          public HazardModel load(Model model) {
            return loadModel(context, model);
          }
        });
    context.setAttribute(MODEL_CACHE_CONTEXT_ID, modelCache);
  }

  private static HazardModel loadModel(ServletContext context, Model model) {
    Path path;
    URL url;
    URI uri;
    String uriString;
    String[] uriParts;
    FileSystem fs;

    try {
      url = context.getResource(model.path);
      uri = new URI(url.toString().replace(" ", "%20"));
      uriString = uri.toString();

      /*
       * When the web sevice is deployed inside a WAR file (and not unpacked by
       * the servlet container) model resources will not exist on disk as
       * otherwise expected. In this case, load the resources directly out of
       * the WAR file as well. This is slower, but with the preload option
       * enabled it may be less of an issue if the models are already in memory.
       */

      if (uriString.indexOf("!") != -1) {
        uriParts = uri.toString().split("!");

        try {
          fs = FileSystems.getFileSystem(
              URI.create(uriParts[0]));
        } catch (FileSystemNotFoundException fnx) {
          fs = FileSystems.newFileSystem(
              URI.create(uriParts[0]),
              new HashMap<String, String>());
        }

        path = fs.getPath(uriParts[1].replaceAll("%20", " "));
      } else {
        path = Paths.get(uri);
      }

      return HazardModel.load(path);

    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  static boolean emptyRequest(HttpServletRequest request) {
    return isNullOrEmpty(request.getQueryString()) &&
        (request.getPathInfo() == null || request.getPathInfo().equals("/"));
  }

  static Timer timer() {
    return new Timer();
  }

  /*
   * Simple timer object. The servlet timer just runs. The calculation timer can
   * be started later.
   */
  public static final class Timer {

    Stopwatch servlet = Stopwatch.createStarted();
    Stopwatch calc = Stopwatch.createUnstarted();

    Timer start() {
      calc.start();
      return this;
    }

    public String servletTime() {
      return servlet.toString();
    }

    public String calcTime() {
      return calc.toString();
    }
  }

  abstract static class TimedTask<T> implements Callable<T> {

    final String url;
    final ServletContext context;
    final Timer timer;

    TimedTask(String url, ServletContext context) {
      this.url = url;
      this.context = context;
      this.timer = ServletUtil.timer();
    }

    abstract T calc() throws Exception;

    @Override
    public T call() throws Exception {
      timer.start();
      return calc();
    }
  }

  /*
   * For sites located west of -115 (in the WUS but not in the CEUS-WUS overlap
   * zone) and site classes of vs30=760, client requests come in with
   * region=COUS, thereby limiting the conversion of imt=any to the set of
   * periods supported by both models. In order for the service to return what
   * the client suggests should be returned, we need to do an addiitional
   * longitude check. TODO clean; fix client eq-hazard-tool
   */
  static Region checkRegion(Region region, double lon) {
    if (region == COUS) {
      return (lon <= WUS.uimaxlongitude) ? WUS : (lon >= CEUS.uiminlongitude) ? CEUS : COUS;
    }
    return region;
  }

  /*
   * IP based access throttling.
   */

  // static final Map<String, Long> IP_TIME = new HashMap<>();
  static final Map<String, Integer> IP_COUNT = new HashMap<>();
  // static final int IP_MAX_REQUESTS = 20;
  // static final long IP_WINDOW_MS = 300000;

  /* blacklist */
  static final String BLOCK_1 = "98.26.65.16";

  static boolean checkRequestIp(HttpServletRequest request) {
    // if (!throttleIp) {
    // return true;
    // }

    String ip = getClientIp(request);
    IP_COUNT.merge(ip, 1, Integer::sum);
    return !ip.startsWith(BLOCK_1);

    // long cTime = System.currentTimeMillis();
    //
    // IP_TIME.putIfAbsent(ip, cTime);
    // IP_COUNT.putIfAbsent(ip, 0);
    //
    // long delta = cTime - IP_TIME.get(ip);
    //
    // /*
    // * (1) If the number of requests is below 20 and ten minutes has passed
    // * since the last request, reset the count and time reference, otherwise
    // * keep the time of the first request, increment the request count, and
    // * allow request to proceed.
    // */
    // if (IP_COUNT.get(ip) < IP_MAX_REQUESTS) {
    // if (delta > IP_WINDOW_MS) {
    // IP_COUNT.put(ip, 0);
    // IP_TIME.put(ip, cTime);
    // return true;
    // }
    // IP_COUNT.merge(ip, 1, Integer::sum);
    // return true;
    // }
    //
    // /*
    // * (2) If the number of recent requests is greater than 20 and less than
    // 10
    // * minutes have passed since the first request, reject request.
    // */
    // if (delta < IP_WINDOW_MS) {
    // return false;
    // }
    //
    // /*
    // * (3) If the number of recent requests is greater than 20 and 10 to 20
    // * minutes has passed since the first request, update the reference time
    // to
    // * the present and allow the request to proceed. This limits requests to
    // * once per ten minutes if the user has made a large number of requests in
    // * rapid succesion.
    // */
    // if (delta < IP_WINDOW_MS * 2) {
    // IP_TIME.put(ip, cTime);
    // return true;
    // }
    //
    // /*
    // * (4) Otherwise, it's been longer than 20 minutes. Reset count and time.
    // */
    // IP_COUNT.put(ip, 0);
    // IP_TIME.put(ip, cTime);
    // return true;
  }

  private static String getClientIp(HttpServletRequest request) {
    String remoteAddr = "";
    if (request != null) {
      remoteAddr = request.getHeader("X-FORWARDED-FOR");
      if (remoteAddr == null || "".equals(remoteAddr)) {
        remoteAddr = request.getRemoteAddr();
      }
    }
    return remoteAddr;
  }

}
